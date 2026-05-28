"use client";

export interface NotificationPermission {
  granted: boolean;
  denied: boolean;
  default: boolean;
}

export interface PushNotification {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
  requireInteraction?: boolean;
  silent?: boolean;
}

export class NotificationManager {
  private static instance: NotificationManager;
  private permission: NotificationPermission = {
    granted: false,
    denied: false,
    default: true,
  };

  private constructor() {
    this.updatePermissionState();
  }

  static getInstance(): NotificationManager {
    if (!NotificationManager.instance) {
      NotificationManager.instance = new NotificationManager();
    }
    return NotificationManager.instance;
  }

  private updatePermissionState(): void {
    if (typeof Notification === "undefined") {
      this.permission = { granted: false, denied: true, default: false };
      return;
    }

    switch (Notification.permission) {
      case "granted":
        this.permission = { granted: true, denied: false, default: false };
        break;
      case "denied":
        this.permission = { granted: false, denied: true, default: false };
        break;
      default:
        this.permission = { granted: false, denied: false, default: true };
    }
  }

  getPermission(): NotificationPermission {
    this.updatePermissionState();
    return this.permission;
  }

  isSupported(): boolean {
    return typeof Notification !== "undefined";
  }

  async requestPermission(): Promise<boolean> {
    if (!this.isSupported()) {
      console.warn("Notifications are not supported");
      return false;
    }

    if (this.permission.granted) {
      return true;
    }

    if (this.permission.denied) {
      console.warn("Notification permission was denied");
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      this.updatePermissionState();
      return result === "granted";
    } catch (err) {
      console.error("Failed to request notification permission:", err);
      return false;
    }
  }

  async sendNotification(notification: PushNotification): Promise<boolean> {
    if (!this.permission.granted) {
      const granted = await this.requestPermission();
      if (!granted) return false;
    }

    try {
      const options: NotificationOptions = {
        body: notification.body,
        icon: notification.icon || "/favicon.ico",
        badge: notification.badge || "/favicon.ico",
        tag: notification.tag,
        data: notification.data,
        requireInteraction: notification.requireInteraction || false,
        silent: notification.silent || false,
      };

      const n = new Notification(notification.title, options);

      n.onclick = () => {
        window.focus();
        if (notification.data?.url) {
          window.location.href = notification.data.url as string;
        }
        n.close();
      };

      n.onerror = (err) => {
        console.error("Notification error:", err);
      };

      return true;
    } catch (err) {
      console.error("Failed to send notification:", err);
      return false;
    }
  }

  async sendAlertNotification(alert: {
    type: string;
    severity: string;
    title: string;
    message: string;
  }): Promise<boolean> {
    const icon = this.getAlertIcon(alert.severity);
    const tag = `alert-${alert.type}-${Date.now()}`;

    return this.sendNotification({
      title: alert.title,
      body: alert.message,
      icon,
      tag,
      requireInteraction: alert.severity === "critical",
      data: {
        type: "alert",
        alertType: alert.type,
        severity: alert.severity,
        url: "/alerts",
      },
    });
  }

  async sendBatchNotifications(alerts: Array<{
    type: string;
    severity: string;
    title: string;
    message: string;
  }>): Promise<number> {
    let sent = 0;
    const maxNotifications = 5;

    const sorted = [...alerts].sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      return (severityOrder[a.severity as keyof typeof severityOrder] || 3) -
             (severityOrder[b.severity as keyof typeof severityOrder] || 3);
    });

    for (const alert of sorted.slice(0, maxNotifications)) {
      const success = await this.sendAlertNotification(alert);
      if (success) sent++;
    }

    return sent;
  }

  private getAlertIcon(severity: string): string {
    switch (severity) {
      case "critical":
        return "/icons/alert-critical.png";
      case "warning":
        return "/icons/alert-warning.png";
      default:
        return "/icons/alert-info.png";
    }
  }

  clearAllNotifications(): void {
    if ("serviceWorker" in navigator && "getNotifications" in ServiceWorkerRegistration.prototype) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.getNotifications().then((notifications) => {
          notifications.forEach((n) => n.close());
        });
      });
    }
  }
}

export const notificationManager = NotificationManager.getInstance();
