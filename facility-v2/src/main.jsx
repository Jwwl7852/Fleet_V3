import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { FacilityV2App } from './FacilityV2App';
import { createFacilityRepository, FACILITY_TEST_DATABASE_NAME } from './data/facilityRepositoryV2';
import './styles/tokens.css';
import './styles/facility-v2.css';

document.documentElement.classList.add('facility-v2-standalone');
const repository = navigator.webdriver
  ? createFacilityRepository({ databaseName: FACILITY_TEST_DATABASE_NAME })
  : undefined;
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><BrowserRouter><FacilityV2App repository={repository} /></BrowserRouter></React.StrictMode>,
);
