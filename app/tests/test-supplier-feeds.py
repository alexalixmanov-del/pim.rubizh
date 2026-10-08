"""Synthetic feeds only. File input is data; entities, formulas and group inference are blocked."""
from pathlib import Path
import tempfile, unittest, importlib.util, zipfile
import openpyxl
from defusedxml.common import DefusedXmlException
spec = importlib.util.spec_from_file_location('feeds', Path(__file__).resolve().parents[1] / 'tools/parse-supplier-feeds.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class SupplierParserTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
    def tearDown(self):
        self.temp.cleanup()
    def xml(self, content):
        path = self.root / 'feed.xml'
        path.write_text(content)
        return path
    def test_exact_supplier_group_and_conflicting_raw_colors_are_preserved(self):
        path = self.xml('<!DOCTYPE yml_catalog SYSTEM "shops.dtd"><yml_catalog date="2026-04-08 14:45"><shop><offers><offer id="1" group_id="g1" available="true"><vendorCode>SKU-1</vendorCode><quantity_in_stock>10</quantity_in_stock><param name="Цвет">Чорний</param><param name="Цвет">Мультикам</param><picture>https://images.test/1.jpg</picture></offer></offers></shop></yml_catalog>')
        offers, _, date = module.xml_feed(path)
        self.assertEqual(date, '2026-04-08 14:45')
        self.assertEqual(offers[0]['supplier_sku'], 'SKU-1')
        self.assertEqual(offers[0]['group_id'], 'g1')
        self.assertEqual(offers[0]['quantity'], '10')
        self.assertEqual(offers[0]['color_values'], ['Чорний', 'Мультикам'])
        self.assertFalse(offers[0]['quantity_verified_current'])
    def test_internal_entities_are_never_expanded(self):
        path = self.xml('<!DOCTYPE yml_catalog [<!ENTITY x "secret">]><yml_catalog><shop><offers><offer id="1"><vendorCode>&x;</vendorCode></offer></offers></shop></yml_catalog>')
        with self.assertRaises(DefusedXmlException):
            module.xml_feed(path)
    def test_external_entities_are_not_read(self):
        secret = self.root / 'private.txt'
        secret.write_text('SHOULD_NOT_BE_READ')
        path = self.xml('<!DOCTYPE yml_catalog [<!ENTITY x SYSTEM "'+secret.as_uri()+'">]><yml_catalog><shop><offers><offer id="1"><vendorCode>&x;</vendorCode></offer></offers></shop></yml_catalog>')
        with self.assertRaises(DefusedXmlException):
            module.xml_feed(path)
    def test_same_name_and_category_do_not_create_model_group(self):
        path = self.xml('<yml_catalog><shop><offers><offer id="1"><vendorCode>A</vendorCode><name>Same product</name><categoryId>category1</categoryId></offer><offer id="2"><vendorCode>B</vendorCode><name>Same product</name><categoryId>category1</categoryId></offer></offers></shop></yml_catalog>')
        offers, _, _ = module.xml_feed(path)
        self.assertTrue(all(o['group_id'] is None for o in offers))
    def test_prom_category_group_is_not_a_model_and_formulas_are_not_evaluated(self):
        book = openpyxl.Workbook()
        sheet = book.active
        sheet.title = 'Export Products Sheet'
        sheet.append(['Унікальний_ідентифікатор','Код_товару','Номер_групи','Ціна','Кількість','Назва_Характеристики','Одиниця_виміру_Характеристики','Значення_Характеристики','Назва_Характеристики','Одиниця_виміру_Характеристики','Значення_Характеристики'])
        sheet.append(['00001','ABC',123,'=1+1',0,'Колір',None,'Чорний','Розмір',None,'M'])
        path = self.root / 'feed.xlsx'
        book.save(path)
        offers, _, generated = module.xlsx_feed(path, 'Унікальний_ідентифікатор')
        self.assertIsNone(generated)
        self.assertIsNone(offers[0]['group_id'])
        self.assertEqual(offers[0]['supplier_sku'], '00001')
        self.assertEqual(offers[0]['quantity'], '0')
        self.assertEqual(offers[0]['color_values'], ['Чорний'])
        self.assertEqual(offers[0]['size_values'], ['M'])
        self.assertEqual(offers[0]['fields']['Ціна'], [None])
    def test_quantity_and_identity_fields_never_guess_missing_values(self):
        self.assertIsNone(module.quantity(''))
        self.assertIsNone(module.quantity('-1'))
        self.assertIsNone(module.quantity('10 шт'))
        self.assertEqual(module.quantity('000.00'), '0')
        self.assertEqual(module.quantity('10.00'), '10')
        self.assertEqual(module.text('000123'), '000123')

if __name__ == '__main__':
    unittest.main()
