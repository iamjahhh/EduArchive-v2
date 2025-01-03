import React, { useState } from "react";
import "./Forms.css"

export default function LoginForm({ onRegister }) {
    const [serverError, setServerError] = useState("");

    const handleSubmit = async (event) => {
        event.preventDefault();
        const formData = new FormData(event.target);
        const username = formData.get("username");
        const password = formData.get("password");

        try {
            const response = await fetch("/api/Login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password })
            });
            const result = await response.json();
            if (response.ok) {
                localStorage.setItem("loggedIn", "true");
                localStorage.setItem("username", result.user.username);
                localStorage.setItem("authToken", result.accessToken);
                localStorage.setItem("refreshToken", result.refreshToken);
                localStorage.setItem("tokenExpires", result.expiresIn);
                window.location.reload();
            } else {
                setServerError(result.message);
            }
        } catch (err) {
            console.error(err);
            setServerError("Server error");
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <div className="card justify-content-center shadow-sm p-3 bg-white rounded">
                <div className="card-body">
                    <div className="card-title text-center">
                        <h3 style={{ fontWeight: "bold" }}>Login</h3>
                    </div>
                    <div className="form-group mt-3">
                        <label for="formGroupExampleInput">Username or Email:</label>
                        <input name="username" type="text" className="form-control" placeholder="Your username or email"></input>
                    </div>
                    <div className="form-group mt-1">
                        <label for="formGroupExampleInput2">Password:</label>
                        <input name="password" type="password" className="form-control" placeholder="Your password"></input>
                    </div>
                    <div className="additional-options">
                        <a id="forgotPasswordLink" href="/forgot-password">Forgot Password?</a>
                    </div>
                    <div className="form-group d-flex-row justify-content-center mt-3">
                        <button className="btn btn-dark w-100">Login</button>
                    </div>
                    <div className="text-danger mt-2">{serverError}</div>
                    <div style={{ marginBottom: "-20px" }} className="switch">
                        <p>Don't have an account?<button id="registerButton" type="button" onClick={onRegister}>Register</button></p>
                    </div>
                </div>
            </div>
        </form>
    );
}