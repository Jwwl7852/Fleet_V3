import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { FacilityV2App } from '../src/FacilityV2App';
import { createDemoDataset } from '../src/data/fixtures';
import { createMemoryFacilityRepository } from '../src/data/facilityRepositoryV2';

function renderApp(path = '/facility', dataset = createDemoDataset()) {
  return render(<MemoryRouter initialEntries={[path]}><FacilityV2App repository={createMemoryFacilityRepository(dataset)} /></MemoryRouter>);
}

function renderEmbedded(path = '/facility-v2', dataset = createDemoDataset()) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/facility-v2/*" element={(
          <FacilityV2App
            basePath="/facility-v2"
            embedded
            repository={createMemoryFacilityRepository(dataset)}
          />
        )} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('FACILITY v2 appskal', () => {
  it('viser et beregnet overblik og den første produktpakke uden FLEET', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Overblik' })).toBeInTheDocument();
    expect(screen.getByText('186.500 kr.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'FLEET' })).not.toBeInTheDocument();
  });

  it('viser FLEET i den kombinerede demopakke uden at ændre FACILITY-data', async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole('heading', { name: 'Overblik' });
    await user.selectOptions(screen.getByLabelText('Vælg produktpakke'), 'combined');
    expect(screen.getByRole('link', { name: 'FLEET' })).toBeInTheDocument();
    expect(screen.getByText('186.500 kr.')).toBeInTheDocument();
  });

  it('bevarer FACILITY-menuens foldetilstand i eget navnerum', async () => {
    const user = userEvent.setup();
    renderApp();
    const moduleButton = await screen.findByRole('button', { name: /FACILITY/ });
    await user.click(moduleButton);
    expect(localStorage.getItem('veyro:facility-v2:facility-menu-open')).toBe('false');
    expect(screen.queryByRole('link', { name: 'Ejendomme' })).not.toBeInTheDocument();
  });

  it('kan åbne dokumentregisteret direkte uden falske resultater', async () => {
    renderApp('/facility/dokumenter');
    expect(await screen.findByRole('heading', { name: 'Dokumenter' })).toBeInTheDocument();
    expect(screen.getByText('Ingen dokumenter matcher')).toBeInTheDocument();
  });

  it('viser tomme tilstande ved manglende datagrundlag', async () => {
    const dataset = createDemoDataset();
    dataset.properties = [];
    dataset.costs = [];
    dataset.serviceOccurrences = [];
    dataset.servicePlans = [];
    renderApp('/facility', dataset);
    await waitFor(() => expect(screen.getByText('Ingen ejendomme endnu')).toBeInTheDocument());
    await waitFor(() => expect(document.querySelector('.cost-card')).toHaveTextContent('Ingen registrerede demoomkostninger'));
  });

  it('bruger platformens route-prefix uden at tegne en ekstra shell', async () => {
    renderEmbedded('/facility-v2/ejendomme');
    expect(await screen.findByRole('heading', { name: 'Ejendomme' })).toBeInTheDocument();
    expect(document.querySelector('.app-shell')).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Åbn/ })[0]).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/facility-v2\/ejendomme\//),
    );
  });
});
