import "./NavBar.css"

const NavBar = () => {
    return (
        <nav className="menu-bar">
            <div className="menu-left">
                <a id="contact" href="#contact"><i className="fa-solid fa-phone"></i><span className="menu-text"> Contact Us</span></a>
                <a id="about" href="#about"><i className="fas fa-info-circle"></i><span className="menu-text"> About Us</span></a>
            </div>
            <div className="menu-right">
                <a href="#login" id="login" style={{ display: "none" }}><i className="fa-solid fa-right-to-bracket"></i><span
                    className="menu-text"> Login</span></a>
                <a href="#history" id="history" style={{ display: "none" }}><i className="fa-solid fa-clock-rotate-left"></i> <span
                    className="menu-text"> History</span></a>
                <a href="#bookmarks" id="bookmarks" style={{ display: "none" }}><i className="fa-solid fa-bookmark"></i><span
                    className="menu-text"> Bookmarks</span></a>
                <a href="#admin-panel" id="adminPanel" style={{ display: "none" }}>
                    <i className="fa-solid fa-cogs"></i><span className="menu-text"> Admin Panel</span>
                </a>
                <a href="#logout" id="logout" style={{ display: "none" }}>
                    <i className="fa-solid fa-right-from-bracket"></i>
                    <span className="menu-text"> Logout | <span className="username"></span></span>
                </a>
            </div>
        </nav>
    );
}

export default NavBar;