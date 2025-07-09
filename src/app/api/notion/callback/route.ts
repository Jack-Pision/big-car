import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  
  let html = '';
  
  if (error) {
    // Handle error case
    html = `
      <html>
        <head>
          <title>Notion Authentication Failed</title>
          <script>
            window.opener.postMessage(
              { type: 'notion-oauth-error', error: '${error}' },
              window.location.origin
            );
            window.close();
          </script>
        </head>
        <body>
          <p>Authentication failed. You can close this window.</p>
        </body>
      </html>
    `;
  } else if (code) {
    try {
      // In a production app, you would exchange the code for tokens here
      // using a secure server-side call to Notion's API
      const clientId = process.env.NOTION_CLIENT_ID;
      const clientSecret = process.env.NOTION_CLIENT_SECRET;
      const redirectUri = `${request.nextUrl.origin}/api/notion/callback`;
      
      // Exchange the code for an access token
      const tokenResponse = await fetch('https://api.notion.com/v1/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri
        })
      });
      
      if (!tokenResponse.ok) {
        throw new Error(`Token exchange failed: ${tokenResponse.statusText}`);
      }
      
      const tokenData = await tokenResponse.json();
      
      // Success page that sends the tokens to the opener window
      html = `
        <html>
          <head>
            <title>Notion Authentication Successful</title>
            <script>
              window.opener.postMessage(
                { 
                  type: 'notion-oauth-success',
                  tokens: ${JSON.stringify({
                    access_token: tokenData.access_token,
                    bot_id: tokenData.bot_id,
                    workspace_id: tokenData.workspace_id,
                    workspace_name: tokenData.workspace_name,
                    workspace_icon: tokenData.workspace_icon
                  })}
                },
                window.location.origin
              );
              window.close();
            </script>
          </head>
          <body>
            <p>Authentication successful! You can close this window.</p>
          </body>
        </html>
      `;
    } catch (error) {
      console.error('Error exchanging code for token:', error);
      
      // Error page
      html = `
        <html>
          <head>
            <title>Notion Authentication Failed</title>
            <script>
              window.opener.postMessage(
                { type: 'notion-oauth-error', error: 'Failed to exchange code for token' },
                window.location.origin
              );
              window.close();
            </script>
          </head>
          <body>
            <p>Authentication failed. You can close this window.</p>
          </body>
        </html>
      `;
    }
  } else {
    // Missing code parameter
    html = `
      <html>
        <head>
          <title>Notion Authentication Failed</title>
          <script>
            window.opener.postMessage(
              { type: 'notion-oauth-error', error: 'Missing authorization code' },
              window.location.origin
            );
            window.close();
          </script>
        </head>
        <body>
          <p>Authentication failed. Missing authorization code.</p>
        </body>
      </html>
    `;
  }
  
  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html',
    },
  });
} 