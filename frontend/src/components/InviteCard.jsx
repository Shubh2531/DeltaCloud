import { useEffect, useState } from "react";
import api from "../lib/api";

const MESSAGE = "I'm learning how stocks and crypto move on DeltaCloud: free $10,000 practice account and an AI that explains the market in plain words. Join me:";

// Your personal invite link: copy it, or share it straight to WhatsApp, Instagram, iMessage...
export default function InviteCard() {
  const [info, setInfo] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get("/growth/me")
      .then((res) => alive && setInfo(res.data))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!info) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${MESSAGE} ${info.link}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy your invite link:", info.link);
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: "DeltaCloud", text: MESSAGE, url: info.link });
    } catch {
      /* closed the share sheet */
    }
  };

  return (
    <div className="card invite">
      <h2>Invite friends</h2>
      <p className="muted">Practice is more fun together. Share your link; anyone who joins with it shows up here.</p>
      <div className="invite-link">
        <code>{info.link.replace(/^https?:\/\//, "")}</code>
        <button type="button" className="btn btn-sm" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
        {typeof navigator !== "undefined" && navigator.share && (
          <button type="button" className="btn btn-sm btn-primary" onClick={share}>
            Share
          </button>
        )}
      </div>
      <p className="small" style={{ margin: 0 }}>
        <b>{info.invited}</b> {info.invited === 1 ? "friend has" : "friends have"} joined with your link
        {info.joinedThisWeek > 0 ? `, ${info.joinedThisWeek} this week` : ""}.
      </p>
    </div>
  );
}
