import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

const PRIMARY_CHECKLIST = [
  {
    "seq_nr": "1.0",
    "standard_ref": "1254 K Criteria for surface roughness",
    "part_val": "",
    "piping_val": "O",
    "welded_val": "O",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "",
    "sheet_metal_val": "",
    "foam_decals_val": "",
    "assembly_val": "",
    "instruction_val": "",
    "information_val": "",
    "safety_labels_val": "",
    "display_order": 1
  },
  {
    "seq_nr": "2.0",
    "standard_ref": "1350 K-f,m,c or v as required General tolerances and            standard references",
    "part_val": "",
    "piping_val": "O",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "",
    "assembly_val": "",
    "instruction_val": "",
    "information_val": "",
    "safety_labels_val": "",
    "display_order": 2
  },
  {
    "seq_nr": "3.0",
    "standard_ref": "1356 K Indirectly stated tolerances for fusion welding",
    "part_val": "",
    "piping_val": "M",
    "welded_val": "",
    "other_val": "",
    "ferro_val": "",
    "non_ferro_val": "",
    "casted_machined_val": "",
    "machined_non_casted_val": "O",
    "sheet_metal_val": "",
    "foam_decals_val": "",
    "assembly_val": "",
    "instruction_val": "",
    "information_val": "",
    "safety_labels_val": "",
    "display_order": 3
  },
  {
    "seq_nr": "4.0",
    "standard_ref": "4366 K Threaded blind holes",
    "part_val": "",
    "piping_val": "O",
    "welded_val": "",
    "other_val": "",
    "ferro_val": "O",
    "non_ferro_val": "O",
    "casted_machined_val": "O",
    "machined_non_casted_val": "O",
    "sheet_metal_val": "",
    "foam_decals_val": "",
    "assembly_val": "",
    "instruction_val": "",
    "information_val": "",
    "safety_labels_val": "",
    "display_order": 4
  },
  {
    "seq_nr": "4a",
    "standard_ref": "4366:01 K Threaded blind holes_ASME",
    "part_val": "",
    "piping_val": "O",
    "welded_val": "",
    "other_val": "",
    "ferro_val": "O",
    "non_ferro_val": "O",
    "casted_machined_val": "O",
    "machined_non_casted_val": "O",
    "sheet_metal_val": "",
    "foam_decals_val": "",
    "assembly_val": "",
    "instruction_val": "",
    "information_val": "",
    "safety_labels_val": "",
    "display_order": 5
  },
  {
    "seq_nr": "5.0",
    "standard_ref": "6131 K Dimensional tolerances and machining allowances for            castings",
    "part_val": "",
    "piping_val": "",
    "welded_val": "",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "",
    "machined_non_casted_val": "",
    "sheet_metal_val": "",
    "foam_decals_val": "",
    "assembly_val": "",
    "instruction_val": "",
    "information_val": "",
    "safety_labels_val": "",
    "display_order": 6
  },
  {
    "seq_nr": "6.0",
    "standard_ref": "6134 K Specifications for steel and iron casting            requirements",
    "part_val": "",
    "piping_val": "",
    "welded_val": "",
    "other_val": "",
    "ferro_val": "O",
    "non_ferro_val": "O",
    "casted_machined_val": "",
    "machined_non_casted_val": "",
    "sheet_metal_val": "",
    "foam_decals_val": "",
    "assembly_val": "",
    "instruction_val": "",
    "information_val": "",
    "safety_labels_val": "",
    "display_order": 7
  },
  {
    "seq_nr": "7.0",
    "standard_ref": "6136 K Specifications of aluminium casting requirements",
    "part_val": "",
    "piping_val": "",
    "welded_val": "",
    "other_val": "",
    "ferro_val": "",
    "non_ferro_val": "M",
    "casted_machined_val": "",
    "machined_non_casted_val": "",
    "sheet_metal_val": "",
    "foam_decals_val": "",
    "assembly_val": "",
    "instruction_val": "",
    "information_val": "",
    "safety_labels_val": "",
    "display_order": 8
  },
  {
    "seq_nr": "8.0",
    "standard_ref": "6785 AIR Paint specifications",
    "part_val": "",
    "piping_val": "",
    "welded_val": "",
    "other_val": "",
    "ferro_val": "O",
    "non_ferro_val": "O",
    "casted_machined_val": "O",
    "machined_non_casted_val": "O",
    "sheet_metal_val": "",
    "foam_decals_val": "",
    "assembly_val": "",
    "instruction_val": "",
    "information_val": "",
    "safety_labels_val": "",
    "display_order": 9
  },
  {
    "seq_nr": "9.0",
    "standard_ref": "6891 K Indication of welding data on drawings",
    "part_val": "",
    "piping_val": "M",
    "welded_val": "",
    "other_val": "",
    "ferro_val": "",
    "non_ferro_val": "",
    "casted_machined_val": "",
    "machined_non_casted_val": "O",
    "sheet_metal_val": "",
    "foam_decals_val": "",
    "assembly_val": "",
    "instruction_val": "",
    "information_val": "",
    "safety_labels_val": "",
    "display_order": 10
  },
  {
    "seq_nr": "11.0",
    "standard_ref": "Confidentiality note. It should contain \"This document is            property of Atlas Copco AB and shall not without our            permission be altered, copied, used for manufacturing or            communicated to any other person or company\".",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "M",
    "assembly_val": "",
    "instruction_val": "M",
    "information_val": "M",
    "safety_labels_val": "M",
    "display_order": 11
  },
  {
    "seq_nr": "12.0",
    "standard_ref": "Prohibited substances note",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "M",
    "assembly_val": "",
    "instruction_val": "M",
    "information_val": "M",
    "safety_labels_val": "M",
    "display_order": 12
  },
  {
    "seq_nr": "13.0",
    "standard_ref": "Sharp edges note",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "",
    "assembly_val": "",
    "instruction_val": "",
    "information_val": "",
    "safety_labels_val": "",
    "display_order": 13
  },
  {
    "seq_nr": "14.0",
    "standard_ref": "Check drawing & document edition, vault edition and BPCS            edition are same",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "M",
    "assembly_val": "",
    "instruction_val": "M",
    "information_val": "M",
    "safety_labels_val": "M",
    "display_order": 14
  },
  {
    "seq_nr": "15.0",
    "standard_ref": "Part or assy linked to document",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "M",
    "assembly_val": "",
    "instruction_val": "M",
    "information_val": "M",
    "safety_labels_val": "M",
    "display_order": 15
  },
  {
    "seq_nr": "16.0",
    "standard_ref": "All parts latest revision",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "M",
    "assembly_val": "",
    "instruction_val": "M",
    "information_val": "M",
    "safety_labels_val": "M",
    "display_order": 16
  },
  {
    "seq_nr": "17.0",
    "standard_ref": "Material assigned. Should be given in title block of the            drawing. Exception for tabular drawing",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "M",
    "assembly_val": "",
    "instruction_val": "",
    "information_val": "",
    "safety_labels_val": "",
    "display_order": 17
  },
  {
    "seq_nr": "18.0",
    "standard_ref": "Material comment added (T for thickness) if not            dimensioned",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "M",
    "assembly_val": "",
    "instruction_val": "",
    "information_val": "",
    "safety_labels_val": "",
    "display_order": 18
  },
  {
    "seq_nr": "19.0",
    "standard_ref": "Treatment assigned, or not applicable. Should be given in            title block of the drawing. Exception for tabular drawing",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "M",
    "assembly_val": "",
    "instruction_val": "",
    "information_val": "",
    "safety_labels_val": "",
    "display_order": 19
  },
  {
    "seq_nr": "20.0",
    "standard_ref": "Treatment see drawing",
    "part_val": "",
    "piping_val": "",
    "welded_val": "",
    "other_val": "",
    "ferro_val": "",
    "non_ferro_val": "",
    "casted_machined_val": "",
    "machined_non_casted_val": "",
    "sheet_metal_val": "",
    "foam_decals_val": "",
    "assembly_val": "",
    "instruction_val": "M",
    "information_val": "M",
    "safety_labels_val": "M",
    "display_order": 20
  },
  {
    "seq_nr": "22.0",
    "standard_ref": "Latest edition of Atlas Copco template used Exception US:            Latest edition of ANSI templates used",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "M",
    "assembly_val": "",
    "instruction_val": "M",
    "information_val": "M",
    "safety_labels_val": "M",
    "display_order": 21
  },
  {
    "seq_nr": "23.0",
    "standard_ref": "Check for spelling mistake",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "M",
    "assembly_val": "",
    "instruction_val": "M",
    "information_val": "M",
    "safety_labels_val": "M",
    "display_order": 22
  },
  {
    "seq_nr": "24.0",
    "standard_ref": "Page numbering if applicable",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "M",
    "assembly_val": "",
    "instruction_val": "M",
    "information_val": "M",
    "safety_labels_val": "M",
    "display_order": 23
  },
  {
    "seq_nr": "26.0",
    "standard_ref": "Standard scale used Exception US: Scales to be used 1/1;            1/2; 1/4; 2/1; 3/1; 4/1; 5/1; 10/1",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "M",
    "assembly_val": "",
    "instruction_val": "O",
    "information_val": "O",
    "safety_labels_val": "O",
    "display_order": 24
  },
  {
    "seq_nr": "27.0",
    "standard_ref": "Are section/detail views nominated",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "M",
    "assembly_val": "",
    "instruction_val": "",
    "information_val": "",
    "safety_labels_val": "M",
    "display_order": 25
  },
  {
    "seq_nr": "28.0",
    "standard_ref": "All basic dimensions available",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "M",
    "assembly_val": "",
    "instruction_val": "",
    "information_val": "",
    "safety_labels_val": "M",
    "display_order": 26
  },
  {
    "seq_nr": "29.0",
    "standard_ref": "Tolerances deviating from general tolerance",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "",
    "assembly_val": "",
    "instruction_val": "",
    "information_val": "",
    "safety_labels_val": "",
    "display_order": 27
  },
  {
    "seq_nr": "30.0",
    "standard_ref": "Geometrical tolerances stated correctly",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "",
    "assembly_val": "",
    "instruction_val": "",
    "information_val": "",
    "safety_labels_val": "",
    "display_order": 28
  },
  {
    "seq_nr": "31.0",
    "standard_ref": "Revision note and symbol(s) available and equal",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "M",
    "assembly_val": "",
    "instruction_val": "M",
    "information_val": "M",
    "safety_labels_val": "M",
    "display_order": 29
  },
  {
    "seq_nr": "32.0",
    "standard_ref": "Welding symbols all available",
    "part_val": "M",
    "piping_val": "",
    "welded_val": "",
    "other_val": "",
    "ferro_val": "",
    "non_ferro_val": "",
    "casted_machined_val": "O",
    "machined_non_casted_val": "O",
    "sheet_metal_val": "",
    "foam_decals_val": "",
    "assembly_val": "",
    "instruction_val": "",
    "information_val": "",
    "safety_labels_val": "",
    "display_order": 30
  },
  {
    "seq_nr": "33.0",
    "standard_ref": "Surface roughness symbols and indicators",
    "part_val": "O",
    "piping_val": "",
    "welded_val": "",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "O",
    "sheet_metal_val": "",
    "foam_decals_val": "",
    "assembly_val": "",
    "instruction_val": "",
    "information_val": "",
    "safety_labels_val": "",
    "display_order": 31
  },
  {
    "seq_nr": "34.0",
    "standard_ref": "All centermarks and centerlines drawn for holes /            symmetric parts",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "",
    "foam_decals_val": "",
    "assembly_val": "",
    "instruction_val": "",
    "information_val": "",
    "safety_labels_val": "",
    "display_order": 32
  },
  {
    "seq_nr": "35.0",
    "standard_ref": "Ten digit numbers",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "M",
    "assembly_val": "",
    "instruction_val": "M",
    "information_val": "M",
    "safety_labels_val": "M",
    "display_order": 33
  },
  {
    "seq_nr": "36.0",
    "standard_ref": "Confidentiality class: Confidential",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "M",
    "assembly_val": "",
    "instruction_val": "",
    "information_val": "",
    "safety_labels_val": "",
    "display_order": 34
  },
  {
    "seq_nr": "37.0",
    "standard_ref": "Confidentiality class: Internal",
    "part_val": "",
    "piping_val": "",
    "welded_val": "",
    "other_val": "",
    "ferro_val": "",
    "non_ferro_val": "",
    "casted_machined_val": "",
    "machined_non_casted_val": "",
    "sheet_metal_val": "",
    "foam_decals_val": "",
    "assembly_val": "",
    "instruction_val": "M",
    "information_val": "M",
    "safety_labels_val": "M",
    "display_order": 35
  },
  {
    "seq_nr": "38.0",
    "standard_ref": "Text on drawing acc.Atlas Copco standard 1212 K . -            English & Portugese text should have font \"Arial\" -            Chinese text should have font \"Simsun\"",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "M",
    "assembly_val": "",
    "instruction_val": "M",
    "information_val": "M",
    "safety_labels_val": "M",
    "display_order": 36
  },
  {
    "seq_nr": "39.0",
    "standard_ref": "Is the drawing unambigously",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "M",
    "assembly_val": "",
    "instruction_val": "M",
    "information_val": "M",
    "safety_labels_val": "M",
    "display_order": 37
  },
  {
    "seq_nr": "40.0",
    "standard_ref": "Approval notification if needeed (PED, ASME,\u00d4\u00c7\u00aa.)",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "",
    "sheet_metal_val": "",
    "foam_decals_val": "",
    "assembly_val": "",
    "instruction_val": "M",
    "information_val": "",
    "safety_labels_val": "",
    "display_order": 38
  },
  {
    "seq_nr": "41.0",
    "standard_ref": "Symbol(s) of quantity Atlas Copco standard 1420 K",
    "part_val": "O",
    "piping_val": "O",
    "welded_val": "",
    "other_val": "",
    "ferro_val": "O",
    "non_ferro_val": "O",
    "casted_machined_val": "O",
    "machined_non_casted_val": "O",
    "sheet_metal_val": "O",
    "foam_decals_val": "",
    "assembly_val": "",
    "instruction_val": "",
    "information_val": "",
    "safety_labels_val": "",
    "display_order": 39
  },
  {
    "seq_nr": "46.0",
    "standard_ref": "Check that no dimensions are manually changed",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "M",
    "assembly_val": "",
    "instruction_val": "",
    "information_val": "",
    "safety_labels_val": "",
    "display_order": 40
  },
  {
    "seq_nr": "47.0",
    "standard_ref": "Check that at least english language is used",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "M",
    "assembly_val": "",
    "instruction_val": "M",
    "information_val": "M",
    "safety_labels_val": "M",
    "display_order": 41
  },
  {
    "seq_nr": "50.0",
    "standard_ref": "Check weight on drawing",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "M",
    "assembly_val": "",
    "instruction_val": "M",
    "information_val": "M",
    "safety_labels_val": "",
    "display_order": 42
  },
  {
    "seq_nr": "51.0",
    "standard_ref": "In case of tabular drawing, all mentioned 3D's should be            linked to the tabular drawing",
    "part_val": "",
    "piping_val": "",
    "welded_val": "",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "",
    "assembly_val": "",
    "instruction_val": "",
    "information_val": "",
    "safety_labels_val": "",
    "display_order": 43
  },
  {
    "seq_nr": "57.0",
    "standard_ref": "Check edition is available for all item numbers of a            tabular drawing",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "M",
    "assembly_val": "",
    "instruction_val": "",
    "information_val": "",
    "safety_labels_val": "",
    "display_order": 44
  },
  {
    "seq_nr": "58.0",
    "standard_ref": "Check supplier information is not given on bought out            parts except for situations referenced in AC Standard            1015K",
    "part_val": "",
    "piping_val": "",
    "welded_val": "",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "",
    "foam_decals_val": "",
    "assembly_val": "",
    "instruction_val": "",
    "information_val": "",
    "safety_labels_val": "",
    "display_order": 45
  },
  {
    "seq_nr": "59.0",
    "standard_ref": "Check brand logo in template - supplier            parts/Manufacturing parts - AC logo. For dimension            drawing, installation drawing, ASL, AIB -de-brand or owned            brand",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "M",
    "assembly_val": "",
    "instruction_val": "M",
    "information_val": "M",
    "safety_labels_val": "M",
    "display_order": 46
  },
  {
    "seq_nr": "42.0",
    "standard_ref": "All R/S or - markings correct",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "M",
    "assembly_val": "",
    "instruction_val": "M",
    "information_val": "M",
    "safety_labels_val": "M",
    "display_order": 47
  },
  {
    "seq_nr": "43.0",
    "standard_ref": "No material on standard parts",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "M",
    "assembly_val": "",
    "instruction_val": "M",
    "information_val": "M",
    "safety_labels_val": "M",
    "display_order": 48
  },
  {
    "seq_nr": "44.0",
    "standard_ref": "Material and comment complete if applicable",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "M",
    "assembly_val": "",
    "instruction_val": "",
    "information_val": "",
    "safety_labels_val": "",
    "display_order": 49
  },
  {
    "seq_nr": "48.0",
    "standard_ref": "Check that Part numbers and Qty are not manually            overwritten",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "M",
    "assembly_val": "",
    "instruction_val": "M",
    "information_val": "M",
    "safety_labels_val": "M",
    "display_order": 50
  },
  {
    "seq_nr": "49.0",
    "standard_ref": "Check that the drawing does not relates to a standard part",
    "part_val": "",
    "piping_val": "",
    "welded_val": "",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "O",
    "foam_decals_val": "",
    "assembly_val": "",
    "instruction_val": "",
    "information_val": "",
    "safety_labels_val": "",
    "display_order": 51
  },
  {
    "seq_nr": "70.0",
    "standard_ref": "Check 'All files are \"For Approval\" or \"Approved' during            ECO",
    "part_val": "M",
    "piping_val": "M",
    "welded_val": "M",
    "other_val": "",
    "ferro_val": "M",
    "non_ferro_val": "M",
    "casted_machined_val": "M",
    "machined_non_casted_val": "M",
    "sheet_metal_val": "M",
    "foam_decals_val": "M",
    "assembly_val": "",
    "instruction_val": "M",
    "information_val": "M",
    "safety_labels_val": "M",
    "display_order": 52
  }
];
declare const Swal: any;

@Component({
  selector: 'app-cadq-config',
  templateUrl: './cadq-config.component.html',
  styleUrls: ['./cadq-config.component.scss']
})
export class CadqConfigComponent implements OnInit {
  private readonly API = `${environment.apiUrl}`;
  teams: any[] = [];
  selectedTeam = 'Global'; // Default to Global (NULL team_name)
  checklistItems: any[] = [];
  isBusy = false;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.fetchTeams();
    this.fetchChecklist();
  }

  fetchTeams() {
    this.http.get<any[]>(`${this.API}/api/structure/teams`).subscribe(
      (data) => {
        this.teams = data || [];
      },
      (error) => console.error('Error fetching teams:', error)
    );
  }

  fetchChecklist() {
    let url = `${this.API}/api/cadq-checklist`;
    if (this.selectedTeam && this.selectedTeam !== 'Global') {
      url += `?team=${encodeURIComponent(this.selectedTeam)}`;
    }
    this.http.get<any[]>(url).subscribe(
      (data) => {
        this.checklistItems = data || [];
        if (this.checklistItems.length === 0) {
          this.loadPrimaryChecklist();
        }
      },
      (error) => console.error('Error fetching checklist:', error)
    );
  }

  onTeamChange() {
    this.fetchChecklist();
  }

  addRow() {
    this.checklistItems.push({
      seq_nr: '',
      standard_ref: '',
      part_val: '',
      piping_val: '',
      welded_val: '',
      other_val: '',
      ferro_val: '',
      non_ferro_val: '',
      casted_machined_val: '',
      machined_non_casted_val: '',
      sheet_metal_val: '',
      foam_decals_val: '',
      assembly_val: '',
      instruction_val: '',
      information_val: '',
      safety_labels_val: '',
      team_name: this.selectedTeam === 'Global' ? null : this.selectedTeam,
      display_order: this.checklistItems.length + 1
    });
  }

  saveRow(item: any) {
    if (this.isBusy) return;
    this.isBusy = true;
    
    // Ensure item has the correct team name assigned before saving
    item.team_name = this.selectedTeam === 'Global' ? null : this.selectedTeam;

    this.http.post(`${this.API}/api/cadq-checklist`, item).subscribe(
      (res: any) => {
        this.isBusy = false;
        if (res.success) {
          Swal.fire({ icon: 'success', title: 'Saved!', timer: 1500, showConfirmButton: false });
          this.fetchChecklist();
        }
      },
      (error) => {
        this.isBusy = false;
        Swal.fire({ icon: 'error', title: 'Error', text: error.error?.error || 'Failed to save row' });
      }
    );
  }

  deleteRow(item: any, index: number) {
    if (!item.id) {
      // Just remove from UI if not saved yet
      this.checklistItems.splice(index, 1);
      return;
    }
    
    Swal.fire({
      title: 'Are you sure?',
      text: "You won't be able to revert this!",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, delete it!'
    }).then((result: any) => {
      if (result.isConfirmed) {
        this.isBusy = true;
        this.http.delete(`${this.API}/api/cadq-checklist/${item.id}`).subscribe(
          (res: any) => {
            this.isBusy = false;
            if (res.success) {
              Swal.fire({ icon: 'success', title: 'Deleted!', timer: 1500, showConfirmButton: false });
              this.fetchChecklist();
            }
          },
          (error) => {
            this.isBusy = false;
            Swal.fire({ icon: 'error', title: 'Error', text: error.error?.error || 'Failed to delete row' });
          }
        );
      }
    });
  }

  loadPrimaryChecklist() {
    this.checklistItems = JSON.parse(JSON.stringify(PRIMARY_CHECKLIST));
    this.checklistItems.forEach(item => {
      item.team_name = this.selectedTeam === 'Global' ? null : this.selectedTeam;
    });
  }

  saveAll() {
    if (this.isBusy) return;
    this.isBusy = true;
    const newItems = this.checklistItems.filter(item => !item.id);
    let completed = 0;
    
    if (newItems.length === 0) {
      this.isBusy = false;
      Swal.fire({ icon: 'info', title: 'No new items to save', timer: 1500, showConfirmButton: false });
      return;
    }

    newItems.forEach(item => {
      item.team_name = this.selectedTeam === 'Global' ? null : this.selectedTeam;
      this.http.post(`${this.API}/api/cadq-checklist`, item).subscribe(
        () => {
          completed++;
          if (completed === newItems.length) {
            this.isBusy = false;
            Swal.fire({ icon: 'success', title: 'All Saved!', timer: 1500, showConfirmButton: false });
            this.fetchChecklist();
          }
        },
        (error) => {
          console.error('Error saving item', error);
          completed++;
          if (completed === newItems.length) {
            this.isBusy = false;
            this.fetchChecklist();
          }
        }
      );
    });
  }
}
