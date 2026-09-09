import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { FacilityV2App } from './FacilityV2App';
import { createFacilityRepository } from './data/facilityRepositoryV2';
import './styles/tokens.css';
import './styles/facility-v2.css';

const repository = navigator.webdriver ? createFacilityRepository({ databaseName: 'veyro-facility-v2-test-e2e' }) : undefined;
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><BrowserRouter><FacilityV2App repository={repository} /></BrowserRouter></React.StrictMode>,
);
