# SharePoint Live Excel Setup

This portal syncs two SharePoint Excel workbooks every 10 minutes through GitHub Actions:

- Executive report workbook: writes `executive-report/data.json`
- Tender portfolio workbook: writes `portfolio/data.json`

## GitHub Secrets

Add these secrets in GitHub:

- `SP_TENANT_ID`
- `SP_CLIENT_ID`
- `SP_CLIENT_SECRET`

Repository path:

`Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`

## Microsoft Entra App

Create an App Registration in Microsoft Entra ID, then create a Client Secret.

Recommended permission:

- Microsoft Graph Application permission: `Sites.Selected`

Then grant the app read access to the SharePoint site or the specific files that contain the two workbooks.

Simpler broad permission if you need a quick test:

- Microsoft Graph Application permission: `Files.Read.All`

Use the broad permission only if acceptable for your tenant policy.

## Workflow

The workflow file is:

`.github/workflows/sync-sharepoint-excels.yml`

It runs:

- manually through `workflow_dispatch`
- automatically every 10 minutes

## Outputs

The action commits updated JSON files:

- `portfolio/data.json`
- `executive-report/data.json`

The public site reads JSON only. Microsoft credentials are never exposed to the browser.
