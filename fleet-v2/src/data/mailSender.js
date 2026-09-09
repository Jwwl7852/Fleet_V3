export const MAIL_DELIVERY_STATES = {
  draft: "Kladde",
  sending: "Sender",
  sent: "Sendt",
  error: "Fejl",
};

export function createDisconnectedMailSender() {
  return {
    kind: "disconnected",
    connected: false,
    async send() { throw new Error("Mailafsendelse er ikke tilsluttet."); },
  };
}

export function createMockMailSender({ fail = false } = {}) {
  const deliveries = [];
  return {
    kind: "test-mock",
    connected: true,
    deliveries,
    async send(message) {
      const delivery = { id: `delivery-${deliveries.length + 1}`, state: "sending", message: structuredClone(message) };
      deliveries.push(delivery);
      if (fail) { delivery.state = "error"; delivery.error = "Kontrolleret testfejl"; throw new Error(delivery.error); }
      delivery.state = "sent";
      delivery.sentAt = "2026-09-07T12:00:00.000Z";
      return structuredClone(delivery);
    },
  };
}
