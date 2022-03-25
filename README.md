# appscript-google-shared-drive-inventory
If you're a Google Workspace Super Admin, you've probably been thinking of ways to inventory and keep a handle on Google Shared Drives. 

They are a really great addition to the Workspace offering, but there are still some gaps in reporting &amp; oversight that some people have wanted. 

This solution uses Google Apps Script and the Drive API to pull information about all the Shared Drives in a domain into a Google Sheet. Then, it uses the Drive API again to loop through all the drives and get the top-level permissions. Note, this does not traverse down into subfolders' permissions inside every shared drive. While this is entirely possible to script, the exponential size and scope of the data collected is too large to be effectively stored in a single Google Sheet (in my opinion). 

This solution is meant to solve two fairly basic questions: 

 - Who owns and has access to the Shared Drives in my domain? 
 - Can I perform an inventory on a schedule, so I can see how things change over time?

This is described in full on [www.techupover.com](https://www.techupover.com/google-shared-drives-and-permissions-into-google-sheet/)

# References

The Drive API returns roles for each email address permitted at the top level of the shared drive. Reference for the role types can be found here: https://developers.google.com/drive/api/guides/ref-roles
