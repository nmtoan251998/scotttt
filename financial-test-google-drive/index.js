const express = require('express');
const fs = require('fs');
const { google } = require('googleapis');
const { join, dirname } = require('path');

const app = express();
const TOKEN_PATH = 'token.json';

// If modifying these scopes, delete token.json.
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.appdata'
];

/**
 * Get Google App credentials from local file
 * @param {string} path Path to credential storage
 * @returns {Object} {clientSecret, clientId, redirectUrl} Credentials
 */
function getGoogleAppCredentials(path) {
  try {
    const file = fs.readFileSync(path);
    console.log('Reading credentials file from path: ', path);
    const credentials = JSON.parse(file);

    // Authorize a client with credentials, then call the Google Drive API.
    const {
      client_secret,
      client_id,
      redirect_uris,
    } = credentials.web;

    if (!client_secret || !client_id || !redirect_uris) {
      throw new Error('Invalid credential file at: ', path);
    }

    return {
      clientSecret: client_secret,
      clientId: client_id,
      redirectUrl: redirect_uris,
    }
  } catch (error) {
    throw error;
  }
}

/**
 * Read and Parse Google App Credentials
 * @returns {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 */
function getOAuth2Client() {
  const credentials = getGoogleAppCredentials('credentials.json');

  const {
    clientSecret,
    clientId,
    redirectUrl,
  } = credentials;
  
  const oAuth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUrl,
  );

  return oAuth2Client;
}

/**
 * Get OAuth2 Url from Google Credential
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @returns {string} Auth URL
 */
function getOAuthUrl(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log('Authorize this app by visiting this url:', authUrl);

  return authUrl;
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
async function authAccessToken(oAuth2Client, code) {
  const { tokens } = await oAuth2Client.getToken(code);

  return tokens;
}

/**
 * Google OAuth Persistent layer - CREATE
 * @param {string} path Data location - currently saved in local file
 * @param {string} token Auth token from Google API
 */
function saveAccessToken(path, token) {
  fs.writeFile(path, JSON.stringify(token), (err) => {
    if (err) return console.error(err);
    console.log('Token stored to', path);
  });
}

/**
 * Google OAuth Persistent layer - READ
 * @param {string} path Data location - currently saved in local file
 * @returns {string} Saved token
 */
function getAccessToken(path = TOKEN_PATH) {
  const token = fs.readFileSync(path);

  return JSON.parse(token);
}

/**
* Describe with given media and metaData and upload it using google.drive.create method()
*/ 
function uploadFile(auth, filename, mimetype, filepath) {
  const drive = google.drive({ version: 'v2', auth });
  const fileMetadata = {
    'name': filename,
  };
  const media = {
    mimeType: mimetype,
    body: fs.createReadStream(filepath),
  };
  drive.files.insert({
    resource: fileMetadata,
    media: media,
    fields: '*',
  }, (err, res) => {
    if (err) {
      // Handle error
      console.error(err);
      return
    }

    const file = res.data;
    console.log(res);

    console.log('Successfully uploaded file: ', file.id);
    console.log('Updating file ' + file.id + 'for public access...');
    drive.revisions.update({
      fileId: file.id,
      revisionId: file.headRevisionId,
      requestBody: {
        published: true,
        publishAuto: true,  
      }
    }).then((res) => {
      console.log('Successfully public file ', file.id);
      console.log(res);
    }).catch((error) => {
      console.log('Error public file ' + file.id + ' - Error: ', error);
    });
  });
}

function uploadSpreadSheet() {
  const sheet = google.sheets({ version: 'v3', auth });

  const resource = {
    properties: {
      title,
    },
  };

  sheet.spreadsheets.create({
    resource,
    fields: 'spreadsheetId',
  }, (err, spreadsheet) => {
    console.log(spreadsheet);
    if (err) {
      // Handle error.
      console.log(err);
    } else {
      console.log(`Spreadsheet ID: ${spreadsheet.spreadsheetId}`);
    }
  });
}

function uploadSpreadSheetV2(auth) {
  const drive = google.drive({ version: 'v3', auth });
  var fileMetadata = {
    'name': 'My Report' + Date.now,
    'mimeType': 'application/vnd.google-apps.spreadsheet'
  };
  var media = {
    mimeType: 'text/csv',
    body: fs.createReadStream('files/KHHT.csv')
  };
  drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: 'id'
  }, function (err, file) {
    if (err) {
      // Handle error
      console.error(err);
    } else {
      console.log('Successfully uploaded file: ', file);
      // console.log('File Id:', file.id);
    }
  });
}

/**
 * Lists the names and IDs of up to 10 files.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 * @param {string} fieldId Uploaded file'id
 */
function getFile(auth, fileId) {
  const drive = google.drive({ version: 'v3', auth });

  drive.files.list({
    // q: "id='" +fileId +"'",
    // corpora: 'drive',
    id: fileId,
    // includeItemsFromAllDrives: true,
    // supportsTeamDrives: true,
    fields: '*',
    spaces: 'drive',
  }, (err, res) => {
    if (err) return console.log('The API returned an error: ' + err);

    console.log(res)
  })
}

/**
 * Lists the names and IDs of up to 10 files.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
 function listFiles(auth) {
   console.log('List Files, ',auth);
    const drive = google.drive({ version: 'v3', auth });
    drive.files.list({
      pageSize: 10,
      fields: 'nextPageToken, files(id, name)',
    }, (err, res) => {
      if (err) return console.log('The API returned an error: ' + err);
  
      console.log(res.data);
      const files = res.data.files;
      if (files.length) {
        console.log('Files:');
        files.map((file) => {
          console.log(`${file.name} (${file.id})`);
        });
      } else {
        console.log('No files found.');
      }
    });
  }

app.get('/', (req, res) => {
  const oAuth2Client = getOAuth2Client();

  res.send(oAuth2Client);
})

app.get('/oauth-url', (req, res) => {
  const oAuth2Client = getOAuth2Client();
  const authUrl = getOAuthUrl(oAuth2Client);

  res.send(authUrl);
})

app.get('/oauth-token', (req, res) => {
  const token = getAccessToken();

  res.send(token);
})

app.get('/redirect', async (req, res) => {
  const oAuth2Client = getOAuth2Client();

  const token = await authAccessToken(oAuth2Client, req.query.code);
  saveAccessToken(TOKEN_PATH, token);

  res.send('Done');
})

app.get('/list-file', (req, res) => {
  const oAuth2Client = getOAuth2Client();

  const accessToken = getAccessToken();

  oAuth2Client.setCredentials(accessToken);
  listFiles(oAuth2Client);

  res.send('OK');
})

app.post('/upload-file', (req, res) => {
  const oAuth2Client = getOAuth2Client();

  const accessToken = getAccessToken();

  oAuth2Client.setCredentials(accessToken);
  uploadFile(
    oAuth2Client,
    'Test ' + Date.now().toString() + '.csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'files/KHHT.csv',
  );

  res.send('OK');
})

app.post('/upload-file-v2', (req, res) => {
  const oAuth2Client = getOAuth2Client();

  const accessToken = getAccessToken();

  oAuth2Client.setCredentials(accessToken);
  uploadSpreadSheetV2(oAuth2Client);

  res.send('OK');
})

app.get('/files/:file_id', (req, res) => {
  const oAuth2Client = getOAuth2Client();

  const accessToken = getAccessToken();

  const id = req.params.file_id || '0B5e43aG8F8ULNjdlMElJeG5QK2N6S3VxdDdBNlA4OUJRTTM0PQ';
  oAuth2Client.setCredentials(accessToken);
  getFile(oAuth2Client, id);

  res.send('OK')
})

app.get('/preview/:file_id', (req, res) => {
  // res.sendFile(join(__dirname, './public/preview.html'));
  // const fileId = '1LqwA9M11nj2MT-ep3fxGSZ1CYgFatCDV';
  const fileId = req.params.file_id || '0B5e43aG8F8ULWXlQRVl0UzJNYjhBc3RieTRIcHR6RkdqV2VJPQ';
  // https://docs.google.com/spreadsheets/d/e/2PACX-1vR8gzH8v1vrs2U9nc_A5TCn0DAqJHqK-uClmbUIJseDNOjbyugbe4RPf3om4DhI_g/pubhtml

  // const iframe = [
  //   '<iframe ',
  //   'src="https://docs.google.com/spreadsheets/d/',
  //   fileId,
  //   '/pubhtml?widget=true&headers=false&embedded=true"></iframe>'
  // ].join('');

  // console.log(fileId);
  // 1LqwA9M11nj2MT-ep3fxGSZ1CYgFatCDV
  // const faker = `
  //   <body>
  //     <div>
  //       <iframe src="https://docs.google.com/spreadsheets/d/${guploadedUploadedId}/pubhtml?widget=true&headers=false&embedded=true"></iframe>
  //     </div>

  //     <script type="text/javascript" src="https://apis.google.com/js/client.js"></script>
  //   </body>
  // `;

  // const content = [
  //   '<body>',
  //     '<div>',
  //       '<iframe ',
  //         'src="https://docs.google.com/spreadsheets/d/e/',
  //         fileId,
  //         '/pubhtml?widget=true&headers=false&embedded=true"></iframe>',
  //       '</div>',
  //   '</body>',
  // ].join('');
  const content = [
    '<body>',
      '<div>',
        '<iframe ',
          'src=https://drive.google.com/file/d/1gTc5attErDufdZOhG3ahQD5orjqMruU2/preview?usp=drivesdk"',
          ' width="1000"',
          ' height="1000"',
            '></iframe>',
        '</div>',
      '<script type="text/javascript" src="https://apis.google.com/js/client.js"></script>',
    '</body>',
  ].join('');

  res.send(content);
})

app.listen(8080, () => console.log(`App is listening on http://localhost:8080`));

