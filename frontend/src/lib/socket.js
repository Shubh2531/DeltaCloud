import { io } from "socket.io-client";
import { BASE, tokens } from "./api";

// The one shared connection. It is opened after sign-in and closed at sign-out.
// `auth` is a function so a reconnect always sends the newest access token.
export const socket = io(BASE, {
  autoConnect: false,
  transports: ["websocket", "polling"],
  auth: (cb) => cb({ token: tokens.getAccess() }),
});
