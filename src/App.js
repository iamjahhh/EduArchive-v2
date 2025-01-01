import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';

import Header from './components/Header';
import NavBar from './components/NavBar';

function App() {
  return (
    <Router>
      <Header />
      <NavBar />
      <Routes>
        <Route exact path="/" element={<Dashboard />} />
        <Route exact path="/admin" element={<Admin />} />
      </Routes>
    </Router>
  );
}

export default App;