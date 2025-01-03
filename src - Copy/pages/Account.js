import React, { useState, useEffect } from "react";

import LoginForm from "../components/LoginForm";
import RegisterForm from "../components/RegisterForm";

const Account = () => {
    const [showRegister, setShowRegister] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    useEffect(() => {
        setIsLoggedIn(localStorage.getItem("loggedIn") === "true");
    }, []);

    const handleShowRegister = () => setShowRegister(true);
    const handleShowLogin = () => setShowRegister(false);

    return (
        <div className="container" style={{ marginTop: "160px", marginBottom: "30px" }}>
            {isLoggedIn ? (
                <div className="row justify-content-center">
                    <div className="col-12 col-lg-10">
                        {/*<AccountDashboard />*/}
                    </div>
                </div>
            ) : (
                <div className="row justify-content-center">
                    <div className="col-12 col-md-6 col-lg-5">
                        {showRegister
                            ? <RegisterForm onLogin={handleShowLogin} />
                            : <LoginForm onRegister={handleShowRegister} />}
                    </div>
                </div>
            )}
        </div>
    )
}

export default Account