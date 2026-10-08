<?php
declare(strict_types=1);
// Standalone read-only bridge for the existing PHP shop. No PIM or customer writes.
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
umask(0077);
try{
 $options=getopt('',['site-root:','output:']);
 $root=realpath((string)($options['site-root']??''));
 if(!$root||!is_file($root.'/api/lib.php'))throw new RuntimeException('Use --site-root=/absolute/shop/www');
 require $root.'/api/lib.php';
 $pdo=rubizhDatabaseConnect(cfg()); // Do not call db(): it can trigger migrations.
 $pdo->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
 $pdo->exec('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
 try{
  $present=$pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);$rows=[];$fingerprints=[];
  foreach(['products'=>'id','variants'=>'sku','photos'=>'id','categories'=>'id','rubizh_catalog_fulfillment'=>'sku','rubizh_catalog_supplier_articles'=>'sku','rubizh_product_categories'=>'product_id','rubizh_canonical_categories'=>'category_id','rubizh_category_aliases'=>'legacy_id','rubizh_category_decisions'=>'product_id','rubizh_supplier_category_rules'=>null] as $table=>$key){
   if(!in_array($table,$present,true))continue;
   $columns=$key?[$key]:array_column($pdo->query("SHOW KEYS FROM `$table` WHERE Key_name='PRIMARY'")->fetchAll(PDO::FETCH_ASSOC),'Column_name');
   if(!$columns||array_filter($columns,fn($k)=>!preg_match('/^[a-zA-Z0-9_]+$/D',$k)))throw new RuntimeException('Unsupported source primary key');
   $order=implode(',',array_map(fn($k)=>'`'.$k.'`',$columns));
   $rows[$table]=$pdo->query("SELECT * FROM `$table` ORDER BY $order")->fetchAll(PDO::FETCH_ASSOC);
   $fingerprints[$table]=hash('sha256',json_encode($rows[$table],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));
  }
  $meta=$pdo->query("SELECT k,v FROM meta WHERE k IN ('taxonomy_version','classifier_version','catalog_updated') ORDER BY k")->fetchAll(PDO::FETCH_KEY_PAIR);
  $pdo->commit();
 }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
 $assets=[];foreach(['shop/canonical-taxonomy.json','assets/category-directory.2026100802.js'] as $asset)if(is_file($root.'/'.$asset))$assets[$asset]=hash_file('sha256',$root.'/'.$asset);
 $usable=[];foreach($rows['photos']??[] as $p)if($p['status']==='ok'&&media_file_exists((string)$p['file']))$usable[]=(int)$p['id'];
 $parent=dirname($root).'/rubizh-private-backups';
 $out=(string)($options['output']??$parent.'/model-source-'.gmdate('Ymd-His').'-'.bin2hex(random_bytes(4)).'.json');
 if(!is_dir(dirname($out))&&!mkdir(dirname($out),0700,true))throw new RuntimeException('Cannot create private export directory');
 $real=realpath(dirname($out));if(!$real||$real===$root||str_starts_with($real,$root.DIRECTORY_SEPARATOR))throw new RuntimeException('Export must be outside web root');
 $out=$real.'/'.basename($out);$fd=fopen($out,'xb');if(!$fd)throw new RuntimeException('Choose a new file; existing exports are immutable');
 $data=['export_version'=>'rubizh-model-source-v1','created_at'=>gmdate('c'),'source'=>'current site database','contains_customer_data'=>false,'contains_private_supplier_data'=>true,'snapshot'=>['tables'=>$rows,'fingerprints'=>$fingerprints,'meta'=>$meta,'asset_fingerprints'=>$assets,'usable_photo_ids'=>$usable]];
 $json=json_encode($data,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);try{if(fwrite($fd,$json)!==strlen($json)||!fflush($fd))throw new RuntimeException('Export write failed');}finally{fclose($fd);}
 echo json_encode(['file'=>$out,'sha256'=>hash('sha256',$json),'products'=>count($rows['products']??[]),'variants'=>count($rows['variants']??[]),'photos'=>count($rows['photos']??[]),'contains_customer_data'=>false,'production_modified'=>false],JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)."\n";
}catch(Throwable $e){fwrite(STDERR,'Read-only export stopped: '.$e->getMessage()."\n");exit(1);}
