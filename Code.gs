// Google Sheet URL that you have access to edit (should be blank to begin with)
var GOOGLE_SHEET_URL = "https://docs.google.com/spreadsheets/d/your-sheet-id/edit";
// tab/sheet name to house the list of File IDs for everything in your Google Drive
var GOOGLE_SHEET_RESULTS_TAB_NAME_DRIVES = "Sheet1";
var GOOGLE_SHEET_RESULTS_TAB_NAME_PERMISSIONS = "Sheet2";

// max results per page when looking up the google api for shared drives. Max is 100.
const GOOGLEAPI_MAX_RESULTS_PER_PAGE = 5;
// number of rows to lookup permissions for, keeping in mind potentially large results and timeout possibility
// early testing showed it's pretty fast, with 50 rows taking about 40 seconds. Would expect this to change though.
// Would recommend setting this in relation with the trigger for how often the script runs.
const NUMBER_OF_ROWS_TO_LOOKUP_PERMISSIONS_PER_LOOP = 100; 

const USE_DOMAIN_ADMIN_ACCESS = true; // true for domain/super admin ..... false for regular user to use on their own shared drives

// configure to send simple notification to someone when the script is done
const EMAIL_RECIPIENT_ADDRESS = 'your-email@your.domain'; // email addresses (comma separated)
const EMAIL_SUBJECT_LINE = 'Appscript Google Shared Drive Audit Complete'; // email addresses (comma separated)

/*
*
* ONLY RUN THIS ONCE TO SET THE HEADER ROWS FOR THE GOOGLE SHEETS
* Later should probably have some logic to look up to see if the first row is set, then run this automatically (or not)
*
*/
function job_set_sheet_headers() {
  
  var drives_sheet = SpreadsheetApp.openByUrl(GOOGLE_SHEET_URL).getSheetByName(GOOGLE_SHEET_RESULTS_TAB_NAME_DRIVES);
  drives_sheet.appendRow(["AUDIT_DATE", "ID", "NAME"]);

  var permissions_sheet = SpreadsheetApp.openByUrl(GOOGLE_SHEET_URL).getSheetByName(GOOGLE_SHEET_RESULTS_TAB_NAME_PERMISSIONS);
  permissions_sheet.appendRow(["AUDIT_DATE", "ID", "NAME", "EMAIL_ADDRESS", "TYPE", "ROLE"]);
  
}


/*
*
* This is the job that will get the full list of shared drives and put the results into the first tab in your target sheet
* It took 76 second to pull 8200 shared drives in the environment this was originally tested in.
*
*/
function job_get_shared_drives_list() {

  var startTime = new Date().getTime();

  var audit_timestamp = Utilities.formatDate(new Date(), "UTC", "yyyy-MM-dd'T'HH:mm:ss'Z'");

  var newRow = [];
  var rowsToWrite = [];
  
  let sharedDrives = Drive.Drives.list({
          maxResults: GOOGLEAPI_MAX_RESULTS_PER_PAGE,
          useDomainAdminAccess: USE_DOMAIN_ADMIN_ACCESS,
          hidden: false,
        });

  let sharedDrivesItems = sharedDrives.items;
  
  // If a next page token exists then iterate through again. 
  while(sharedDrives.nextPageToken){
    sharedDrives = Drive.Drives.list(
      {
        pageToken:sharedDrives.nextPageToken,
        maxResults: GOOGLEAPI_MAX_RESULTS_PER_PAGE,
        useDomainAdminAccess: USE_DOMAIN_ADMIN_ACCESS,
        hidden: false,
      }
    );

    sharedDrivesItems = sharedDrivesItems.concat(sharedDrives.items)
    //console.log(sharedDrives.items);
    //console.log(sharedDrivesItems.length);

  }

  //console.log(sharedDrivesItems);

  sharedDrivesItems.forEach(function(value) {
    var newRow = [audit_timestamp, value.id, value.name];
    // add to row array instead of append because append is SLOOOOOWWWWW
    rowsToWrite.push(newRow);
    //console.log(newRow);
  });

  var ss = SpreadsheetApp.openByUrl(GOOGLE_SHEET_URL).getSheetByName(GOOGLE_SHEET_RESULTS_TAB_NAME_DRIVES);
  ss.getRange(ss.getLastRow() + 1, 1, rowsToWrite.length, rowsToWrite[0].length).setValues(rowsToWrite);

  var endTime = new Date().getTime();

  var elapsed = (endTime-startTime)/1000;
  console.log('Elapsed Seconds: ' + elapsed);

}

/*
*
* This is the job that will loop through the first tab and look up the permissions for each shared drive.
* Then it will save those results into the next tab in the target sheet, and delete the original row from the first tab.
* This way, the script won't try to lookup the same drive twice (though i guess it's possible if errors occur that i haven't
* accounted for. Feel free to submit improvements for this :-)
*
*/
function job_get_permissions_for_drives() {
  
  var startTime = new Date().getTime();
  
  var drives_sheet = SpreadsheetApp.openByUrl(GOOGLE_SHEET_URL).getSheetByName(GOOGLE_SHEET_RESULTS_TAB_NAME_DRIVES);
  var rangeData = drives_sheet.getDataRange();
  var lastColumn = rangeData.getLastColumn();
  var lastRow = rangeData.getLastRow();
  var searchRange = drives_sheet.getRange(2,1, NUMBER_OF_ROWS_TO_LOOKUP_PERMISSIONS_PER_LOOP, lastColumn);
  
  // Get array of values in the search Range
  var values = searchRange.getValues();
  // console.log("values");
  // console.log(values);
  // Loop through array and if condition met, do relevant permissions lookup
  for ( i = 0; i < NUMBER_OF_ROWS_TO_LOOKUP_PERMISSIONS_PER_LOOP; i++) {

    if(values[0][0] == '') {
      console.log('Source row empty. Script probably complete now.');
      send_email_simple_(EMAIL_RECIPIENT_ADDRESS,EMAIL_SUBJECT_LINE,'Source row empty for Shared Drive Audit process. The script probably complete now.');
      return;
    }
    
    var newRow = [];
    var rowsToWrite = [];
    
    this_audit_date = values[i][0];
    this_drive_id = values[i][1];
    this_drive_name = values[i][2];

    console.log('GETTING DRIVE NAME: ' + this_drive_name);

    var thisDrivePermissions = Drive.Permissions.list(
      this_drive_id,
      {
        useDomainAdminAccess: USE_DOMAIN_ADMIN_ACCESS,
        supportsAllDrives: true
      } 
    );

    //now loop through each permission item
    var newRow = [];
    if(thisDrivePermissions.items.length >= 1) {
        //console.log('permissions were not empty');
        thisDrivePermissions.items.forEach(function(value) {
        //console.log(value);
        newRow = [this_audit_date, this_drive_id, this_drive_name, value.emailAddress, value.type, value.role];
        // add to row array instead of append because appending each one at a time is SLOOOOOWWWWW
        
      });
    } else {
        console.log('permissions were empty');
        newRow = [this_audit_date, this_drive_id, this_drive_name, 'ORPHAN', 'ORPHAN', 'ORPHAN'];
    }

    rowsToWrite.push(newRow);
    //console.log(newRow);
    
    // write the permissions items to the permissions tab
    var ss = SpreadsheetApp.openByUrl(GOOGLE_SHEET_URL).getSheetByName(GOOGLE_SHEET_RESULTS_TAB_NAME_PERMISSIONS);
    ss.getRange(ss.getLastRow() + 1, 1, rowsToWrite.length, rowsToWrite[0].length).setValues(rowsToWrite);

    // now delete the row from the drives sheet so we dont have to process it again on the next loop
    // this should always be row #2, because we've deleted the previous ROW 2 during the last loop iteration
    var rowToDelete = 2; 
    drives_sheet.deleteRow(rowToDelete);
    //console.log('DELETING DRIVE NAME: ' + this_drive_name);
    //console.log('DELETING ROW: ' + rowToDelete);
    
  };

  var endTime = new Date().getTime();

  var elapsed = (endTime-startTime)/1000;
  console.log('Elapsed Seconds: ' + elapsed);
 
};

function send_email_simple_(recipient,subject,plain_text_body) {

  MailApp.sendEmail(
    recipient,
    subject,
    plain_text_body
  );

}
