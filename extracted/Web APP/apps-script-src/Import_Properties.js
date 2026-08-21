function importScriptProperties() {

  // Inser here the ID of sheet X1- Configurations
  const sheetId = "1b0uy_RZxOba3gf82VxpUZJtRpmRIyEERR4ZDwLG9hkM";
  const sheetName = "Script Properties";

  const sheet = SpreadsheetApp.openById(sheetId).getSheetByName(sheetName);

  // Read D5:E(lastRow)
  const startRow = 5;
  const range = sheet.getRange(startRow, 3, sheet.getLastRow() - startRow + 1, 2);
  const data = range.getValues();  // array of [key, value]

  const scriptProps = PropertiesService.getScriptProperties();
  const propsToSet = {};

  data.forEach(([key, value]) => {
    if (key && value !== "") {
      propsToSet[key] = value;
    }
  });

  scriptProps.setProperties(propsToSet, true); // overwrite = true

  Logger.log(`Imported ${Object.keys(propsToSet).length} script properties.`);
}