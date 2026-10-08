'use strict';
const path=require('node:path');
module.exports=async function*(source){for await(const {type,data} of source){if(['test:pass','test:fail','test:summary'].includes(type)){const file=data.file?path.basename(data.file):null;yield JSON.stringify({type,file,name:data.name??null,line:data.line??null,duration_ms:data.details?.duration_ms??null,summary:type==='test:summary'?{tests:data.counts?.tests,passed:data.counts?.passed,failed:data.counts?.failed,skipped:data.counts?.skipped,cancelled:data.counts?.cancelled,success:data.success}:null})+'\n';}}};
