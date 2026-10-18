// Synthetic demo data (plan T5.1, R-DEMO-1, R-EXT-4). Every record here is invented for demonstration.
// Brand names are real manufacturers so the catalog looks familiar; SKUs, prices, suppliers, and invoices are made up.
// Used by scripts/make-sample-invoices.mjs and scripts/seed-demo.mjs.

export const DEMO_SHOP = { name: 'Demo shop (synthetic data)', currency: 'PHP', timezone: 'Asia/Manila' }

export const SUPPLIERS = ['Bayan Auto Supply (synthetic)', 'Masagana Parts Trading (synthetic)']

// [sku, part_number, description, brand, base_unit, selling_price, reorder_threshold, shelf_bin, opening_qty]
export const PRODUCTS = [
  ['DM-0001', 'BKR6E-11', 'Spark plug, nickel', 'NGK', 'pc', '120.00', '20', 'A-01', '48'],
  ['DM-0002', 'BKR6EIX', 'Spark plug, iridium', 'NGK', 'pc', '480.00', '8', 'A-01', '12'],
  ['DM-0003', 'K20PR-U11', 'Spark plug, nickel', 'Denso', 'pc', '115.00', '20', 'A-02', '36'],
  ['DM-0004', 'IK20TT', 'Spark plug, iridium twin tip', 'Denso', 'pc', '520.00', '8', 'A-02', '6'],
  ['DM-0005', 'FR7DC+', 'Spark plug, super plus', 'Bosch', 'pc', '135.00', '12', 'A-03', '24'],
  ['DM-0006', 'W 712/75', 'Oil filter', 'Mann-Filter', 'pc', '320.00', '10', 'B-01', '18'],
  ['DM-0007', 'W 610/3', 'Oil filter', 'Mann-Filter', 'pc', '295.00', '10', 'B-01', '4'],
  ['DM-0008', 'C-1012', 'Oil filter (Toyota fit)', 'Sakura', 'pc', '185.00', '10', 'B-02', '30'],
  ['DM-0009', 'C-1012', 'Oil filter (Toyota fit)', 'VIC', 'pc', '175.00', '10', 'B-02', '22'],
  ['DM-0010', '0 986 452 041', 'Oil filter', 'Bosch', 'pc', '260.00', '8', 'B-03', '9'],
  ['DM-0011', 'C 3698/3', 'Air filter', 'Mann-Filter', 'pc', '640.00', '5', 'B-04', '7'],
  ['DM-0012', 'A-1184', 'Air filter', 'Sakura', 'pc', '420.00', '5', 'B-04', '11'],
  ['DM-0013', 'CUK 2442', 'Cabin filter, activated carbon', 'Mann-Filter', 'pc', '780.00', '4', 'B-05', '5'],
  ['DM-0014', '0 986 494 524', 'Brake pad set, front', 'Bosch', 'set', '1650.00', '4', 'C-01', '6'],
  ['DM-0015', 'BP-1503', 'Brake pad set, front', 'Bendix', 'set', '1580.00', '4', 'C-01', '3'],
  ['DM-0016', 'BP-1503', 'Brake pad set, front', 'Akebono', 'set', '1890.00', '4', 'C-02', '5'],
  ['DM-0017', 'DOT4-500', 'Brake fluid DOT4, 500 ml', 'Bosch', 'bottle', '310.00', '6', 'D-01', '14'],
  ['DM-0018', 'DOT3-1L', 'Brake fluid DOT3, 1 L', 'Prestone', 'bottle', '420.00', '6', 'D-01', '8'],
  ['DM-0019', '10W-40-4L', 'Engine oil 10W-40, semi-synthetic, 4 L', 'Shell Helix', 'jug', '1450.00', '6', 'D-02', '10'],
  ['DM-0020', '5W-30-4L', 'Engine oil 5W-30, fully synthetic, 4 L', 'Mobil 1', 'jug', '2650.00', '4', 'D-02', '6'],
  ['DM-0021', '20W-50-1L', 'Engine oil 20W-50, 1 L', 'Petron', 'bottle', '310.00', '12', 'D-03', '40'],
  ['DM-0022', 'ATF-DIII-1L', 'Automatic transmission fluid Dexron III, 1 L', 'Caltex', 'bottle', '380.00', '6', 'D-03', '12'],
  ['DM-0023', 'CLT-4L', 'Coolant, pre-mixed, 4 L', 'Prestone', 'jug', '890.00', '4', 'D-04', '5'],
  ['DM-0024', '6PK1200', 'Poly V-belt 6PK1200', 'Gates', 'pc', '690.00', '4', 'E-01', '6'],
  ['DM-0025', '4PK875', 'Poly V-belt 4PK875', 'Bando', 'pc', '420.00', '4', 'E-01', '8'],
  ['DM-0026', 'TB-153', 'Timing belt, 153 teeth', 'Gates', 'pc', '1250.00', '2', 'E-02', '3'],
  ['DM-0027', 'NS40ZL', 'Battery NS40ZL, maintenance free', 'Motolite', 'pc', '4200.00', '2', 'F-01', '4'],
  ['DM-0028', '1SMF', 'Battery 1SMF, maintenance free', 'Amaron', 'pc', '5600.00', '2', 'F-01', '2'],
  ['DM-0029', 'H4-12V-60/55W', 'Headlight bulb H4 12V 60/55W', 'Philips', 'pc', '260.00', '10', 'G-01', '25'],
  ['DM-0030', 'H4-12V-60/55W', 'Headlight bulb H4 12V 60/55W', 'Osram', 'pc', '280.00', '10', 'G-01', '18'],
  ['DM-0031', 'T10-W5W', 'Bulb T10 W5W, pack of 10', 'Osram', 'box', '350.00', '3', 'G-02', '6'],
  ['DM-0032', 'WB-22', 'Wiper blade 22 in', 'Bosch', 'pc', '450.00', '6', 'G-03', '12'],
  ['DM-0033', 'WB-16', 'Wiper blade 16 in', 'Bosch', 'pc', '390.00', '6', 'G-03', '9'],
  ['DM-0034', 'KYB-334034', 'Shock absorber, front gas', 'KYB', 'pc', '2850.00', '2', 'H-01', '4'],
  ['DM-0035', 'CV-T-031', 'CV joint, outer', 'GKN', 'pc', '2200.00', '2', 'H-02', '2'],
  ['DM-0036', 'WP-1171', 'Water pump', 'Aisin', 'pc', '2400.00', '2', 'H-03', '3'],
  ['DM-0037', 'RAD-CAP-108', 'Radiator cap 108 kPa', 'Denso', 'pc', '240.00', '6', 'H-04', '10'],
  ['DM-0038', 'FF-5404', 'Fuel filter', 'Denso', 'pc', '540.00', '4', 'B-06', '6'],
  ['DM-0039', 'HOSE-ID16', 'Radiator hose, 16 mm inner diameter', 'Gates', 'm', '180.00', '5', 'H-05', '20'],
  ['DM-0040', 'GRS-500', 'Multi-purpose grease, 500 g', 'Shell', 'tub', '330.00', '4', 'D-05', '7'],
]

// Three synthetic supplier invoices. `wording` is how the supplier writes the line; `sku` is the true match.
// `read` describes what the demo extractor returns for the line (to show uncertain and missing fields).
export const SAMPLE_INVOICES = [
  {
    file: 'sample-invoice-bayan-0412.png',
    format: 'png',
    supplier: SUPPLIERS[0],
    number: 'BAS-0412',
    date: '2026-03-10',
    lines: [
      { sku: 'DM-0001', wording: 'NGK SPARK PLUG BKR6E-11', part: 'BKR6E-11', qty: '20', unit: 'pc', price: '95.00' },
      { sku: 'DM-0006', wording: 'MANN OIL FILTER W712/75', part: 'W 712/75', qty: '6', unit: 'pc', price: '255.00' },
      { sku: 'DM-0017', wording: 'BOSCH BRAKE FLUID DOT4 500ML', part: 'DOT4-500', qty: '12', unit: 'btl', price: '240.00', read: { unit: { confidence: 0.55 } } },
      { sku: 'DM-0008', wording: 'OIL FILTER C-1012 (TOYOTA)', part: 'C-1012', qty: '10', unit: 'pc', price: '140.00' },
    ],
    read: { doc_date: { confidence: 0.62 } },
  },
  {
    file: 'sample-invoice-masagana-7781.png',
    format: 'png',
    supplier: SUPPLIERS[1],
    number: 'MPT-7781',
    date: '2026-03-12',
    lines: [
      { sku: 'DM-0031', wording: 'OSRAM T10 W5W BULB', part: 'T10-W5W', qty: '2', unit: 'box', price: '280.00' },
      { sku: 'DM-0032', wording: 'BOSCH WIPER 22"', part: 'WB-22', qty: '4', unit: 'pc', price: '360.00' },
      { sku: 'DM-0024', wording: 'GATES 6PK1200 V-BELT', part: '6PK1200', qty: '3', unit: 'pc', price: '540.00', read: { part_number: { value: null } } },
    ],
    read: { doc_number: { confidence: 0.58 } },
  },
  {
    file: 'sample-invoice-bayan-0419.pdf',
    format: 'pdf',
    supplier: SUPPLIERS[0],
    number: 'BAS-0419',
    date: '2026-03-17',
    lines: [
      { sku: 'DM-0019', wording: 'SHELL HELIX HX5 10W-40 4L', part: '10W-40-4L', qty: '6', unit: 'jug', price: '1180.00' },
      { sku: 'DM-0014', wording: 'BOSCH BRAKE PAD FRONT 0986494524', part: '0 986 494 524', qty: '2', unit: 'set', price: '1320.00' },
      { sku: 'DM-0015', wording: 'BENDIX BRAKE PAD BP-1503', part: 'BP-1503', qty: '2', unit: 'set', price: '1250.00', read: { quantity: { confidence: 0.41 } } },
      { sku: 'DM-0027', wording: 'MOTOLITE NS40ZL BATTERY', part: 'NS40ZL', qty: '1', unit: 'pc', price: '3500.00' },
      { sku: 'DM-0039', wording: 'RADIATOR HOSE ID16', part: 'HOSE-ID16', qty: '10', unit: 'm', price: '135.00' },
    ],
  },
]
