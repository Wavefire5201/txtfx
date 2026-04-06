"use client";

import { useEffect, useState, useCallback } from "react";
import { CheckCircle, X, Info, Warning } from "@phosphor-icons/react";

export type ToastType = "success" | "info" | "warning";

interface ToastMessage {
  id: number;
  text: string;
  type: ToastType;
}

let toastId = 0;
const listeners: Set<(msg: ToastMessage) => void> = new Set();

export function toast(text: string, type: ToastType = "success") {
  const msg: ToastMessage = { id: ++toastId, text, type };
  listeners.forEach((fn) => fn(msg));
}

export function ToastContainer() {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const addMessage = useCallback((msg: ToastMessage) => {
    setMessages((prev) => [...prev, msg]);
    setTimeout(() => {
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    }, 3000);
  }, []);

  useEffect(() => {
    listeners.add(addMessage);
    return () => { listeners.delete(addMessage); };
  }, [addMessage]);

  const icons = {
    success: <CheckCircle size={16} weight="fill" />,
    info: <Info size={16} weight="fill" />,
    warning: <Warning size={16} weight="fill" />,
  };

  return (
    <div className="toast-container">
      {messages.map((msg) => (
        <div key={msg.id} className={`toast toast--${msg.type}`}>
          <span className="toast-icon">{icons[msg.type]}</span>
          <span className="toast-text">{msg.text}</span>
          <button
            className="toast-close"
            onClick={() => setMessages((prev) => prev.filter((m) => m.id !== msg.id))}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
