// Google Sheet URL that you have access to edit (should be blank to begin with)
var GOOGLE_SHEET_URL = "https://docs.google.com/spreadsheets/d/your-sheet-id/edit?gid=0#gid=0/edit";
// tab/sheet name to house the list of File IDs for everything in your Google Drive
var GOOGLE_SHEET_RESULTS_TAB_NAME_DRIVES = "Sheet1";
var GOOGLE_SHEET_RESULTS_TAB_NAME_PERMISSIONS = "Sheet2";

// max results per page when looking up the google api for shared drives. Max is 100.
const GOOGLEAPI_MAX_RESULTS_PER_PAGE = 5;
// number of rows to lookup permissions for, keeping in mind potentially large results and timeout possibility
// early testing showed it's pretty fast, with 50 rows taking about 40 seconds. Would expect this to change though.
// Would recommend setting this in relation with the trigger for how often the script runs.
const NUMBER_OF_ROWS_TO_LOOKUP_PERMISSIONS_PER_LOOP = 100; 

const USE_DOMAIN_ADMIN_ACCESS = false; // true for domain/super admin ..... false for regular user to use on their own shared drives

// configure to send simple notification to someone when the script is done
const EMAIL_RECIPIENT_ADDRESS = 'your-email@your-domain.com'; // email addresses (comma separated)
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
  var rowsToWrite = [];
  var pageToken = null;

  do {
    var response = Drive.Drives.list({
      maxResults: GOOGLEAPI_MAX_RESULTS_PER_PAGE, // Drive API v2
      pageSize: GOOGLEAPI_MAX_RESULTS_PER_PAGE,   // Drive API v3-safe
      pageToken: pageToken,
      useDomainAdminAccess: USE_DOMAIN_ADMIN_ACCESS,
      hidden: false,
      fields: "*"
    });

    var drives = response.items || response.drives || [];

    drives.forEach(function(drive) {
      rowsToWrite.push([
        audit_timestamp,
        drive.id,
        drive.name
      ]);
    });

    pageToken = response.nextPageToken;

  } while (pageToken);

  if (rowsToWrite.length === 0) {
    console.log("No shared drives found.");
    return;
  }

  var sheet = SpreadsheetApp.openByUrl(GOOGLE_SHEET_URL)
    .getSheetByName(GOOGLE_SHEET_RESULTS_TAB_NAME_DRIVES);

  sheet
    .getRange(sheet.getLastRow() + 1, 1, rowsToWrite.length, rowsToWrite[0].length)
    .setValues(rowsToWrite);

  console.log('Elapsed Seconds: ' + ((new Date().getTime() - startTime) / 1000));
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

  var spreadsheet = SpreadsheetApp.openByUrl(GOOGLE_SHEET_URL);
  var drives_sheet = spreadsheet.getSheetByName(GOOGLE_SHEET_RESULTS_TAB_NAME_DRIVES);
  var permissions_sheet = spreadsheet.getSheetByName(GOOGLE_SHEET_RESULTS_TAB_NAME_PERMISSIONS);

  var lastRow = drives_sheet.getLastRow();
  var lastColumn = drives_sheet.getLastColumn();

  if (lastRow < 2) {
    console.log('No source rows left. Script probably complete now.');
    send_email_simple_(EMAIL_RECIPIENT_ADDRESS, EMAIL_SUBJECT_LINE, 'Shared Drive Audit process appears complete.');
    return;
  }

  var rowsToProcess = Math.min(NUMBER_OF_ROWS_TO_LOOKUP_PERMISSIONS_PER_LOOP, lastRow - 1);
  var values = drives_sheet.getRange(2, 1, rowsToProcess, lastColumn).getValues();
  var allPermissionRows = [];

  for (var i = 0; i < values.length; i++) {
    var this_audit_date = values[i][0];
    var this_drive_id = values[i][1];
    var this_drive_name = values[i][2];

    if (!this_drive_id) {
      continue;
    }

    console.log('GETTING DRIVE NAME: ' + this_drive_name);

    var pageToken = null;
    var foundPermissions = false;

    do {
      var response = Drive.Permissions.list(this_drive_id, {
        useDomainAdminAccess: USE_DOMAIN_ADMIN_ACCESS,
        supportsAllDrives: true,
        pageToken: pageToken,
        fields: "*"
      });

      var permissions = response.items || response.permissions || [];

      permissions.forEach(function(permission) {
        foundPermissions = true;
        allPermissionRows.push([
          this_audit_date,
          this_drive_id,
          this_drive_name,
          permission.emailAddress || '',
          permission.type || '',
          permission.role || ''
        ]);
      });

      pageToken = response.nextPageToken;

    } while (pageToken);

    if (!foundPermissions) {
      allPermissionRows.push([
        this_audit_date,
        this_drive_id,
        this_drive_name,
        'ORPHAN',
        'ORPHAN',
        'ORPHAN'
      ]);
    }
  }

  if (allPermissionRows.length > 0) {
    permissions_sheet
      .getRange(permissions_sheet.getLastRow() + 1, 1, allPermissionRows.length, allPermissionRows[0].length)
      .setValues(allPermissionRows);
  }

  drives_sheet.deleteRows(2, rowsToProcess);

  console.log('Elapsed Seconds: ' + ((new Date().getTime() - startTime) / 1000));
};

function send_email_simple_(recipient,subject,plain_text_body) {

  MailApp.sendEmail(
    recipient,
    subject,
    plain_text_body
  );

}
