import React from "react";
import ReactDOM from "react-dom/client";
import AuthProvider from "./AuthProvider";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      {(props) => <App {...props} />}
    </AuthProvider>
  </React.StrictMode>
);
