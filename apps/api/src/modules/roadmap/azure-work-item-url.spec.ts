import { azureWorkItemWebUrl } from './azure-work-item-url';

describe('azureWorkItemWebUrl', () => {
  it('turns an organization-level REST url into a card link', () => {
    expect(
      azureWorkItemWebUrl(
        'https://dev.azure.com/org/_apis/wit/workItems/29313',
        'OKR',
        '29313',
      ),
    ).toBe('https://dev.azure.com/org/OKR/_workitems/edit/29313');
  });

  it('drops the project GUID segment and encodes the project name', () => {
    expect(
      azureWorkItemWebUrl(
        'https://dev.azure.com/org/0f8b5c3e-1a2b-4c5d-8e9f-0123456789ab/_apis/wit/workItems/7',
        'Team Portal',
        7,
      ),
    ).toBe('https://dev.azure.com/org/Team%20Portal/_workitems/edit/7');
  });

  it('keeps on-premises collection paths', () => {
    expect(
      azureWorkItemWebUrl(
        'https://tfs.example.com/tfs/DefaultCollection/_apis/wit/workItems/5',
        'Portal',
        '5',
      ),
    ).toBe(
      'https://tfs.example.com/tfs/DefaultCollection/Portal/_workitems/edit/5',
    );
  });

  it('leaves web urls and unknown projects alone', () => {
    expect(
      azureWorkItemWebUrl(
        'https://dev.azure.com/org/OKR/_workitems/edit/5',
        'OKR',
        '5',
      ),
    ).toBeNull();
    expect(
      azureWorkItemWebUrl(
        'https://dev.azure.com/org/_apis/wit/workItems/5',
        undefined,
        '5',
      ),
    ).toBeNull();
    expect(azureWorkItemWebUrl(null, 'OKR', '5')).toBeNull();
  });
});
