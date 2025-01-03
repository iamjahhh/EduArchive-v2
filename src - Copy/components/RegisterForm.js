import React, { useState } from "react";
import "./Forms.css"

export default function RegisterForm({ onLogin }) {
    const [serverError, setServerError] = useState("");

    const handleRegister = async (event) => {
        event.preventDefault();
        const formData = new FormData(event.target);
        const username = formData.get("username");
        const password = formData.get("password");
        const email = formData.get("email");

        try {
            const response = await fetch("/api/Register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password, email })
            });
            const result = await response.json();
            if (response.ok) {
                onLogin();
            } else {
                setServerError(result.message);
            }
        } catch (err) {
            console.error(err);
            setServerError("Server error");
        }
    };

    return (
        <form onSubmit={handleRegister}>
            <div className="card justify-content-center shadow-sm p-3 bg-white rounded">
                <div className="card-body">
                    <div className="card-title">
                        <h3 style={{ fontWeight: "bold" }}>Register</h3>
                    </div>
                    <div className="form-group mt-3">
                        <label for="formGroupExampleInput">Username:</label>
                        <input name="username" type="text" className="form-control"></input>
                    </div>
                    <div className="form-group mt-3">
                        <label for="formGroupExampleInput">Email:</label>
                        <input name="email" type="text" className="form-control"></input>
                    </div>
                    <div className="form-group mt-3">
                        <label for="formGroupExampleInput">Password:</label>
                        <input name="password" type="password" className="form-control"></input>
                    </div>
                    <div className="form-group d-flex-row justify-content-center mt-3">
                        <button className="btn btn-dark w-100">Register</button>
                    </div>
                    <div className="text-danger mt-2">{serverError}</div>
                    <div style={{ marginBottom: "-20px" }} className="switch">
                        <p>Already have an account?<button id="loginButton" type="button" onClick={onLogin}>Login</button></p>
                    </div>
                </div>
            </div>
        </form>
    );
}