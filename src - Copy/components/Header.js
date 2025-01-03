import React from 'react';
import logo from "../assets/logo.jpg";

import "./Header.css";

const Header = () => {
    return (
        <header>
            <div className="header-content">
                <img src={logo} alt="EduArchive Logo" className="logo" />
                <div className="tagline">
                    <p>A Comprehensive Compilation</p>
                    <p>of Academic Resources</p>
                </div>
            </div>
        </header>
    );
}

export default Header;