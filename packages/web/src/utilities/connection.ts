export function emptyBrokerDraft() {
  return {
    id: "",
    name: "local-mosquitto",
    host: "localhost",
    port: 1883,
    protocol: "mqtt",
    validateCertificate: true,
    encryption: false,
    username: "",
    password: "",
    clientId: "",
    clean: true,
    keepAlive: 30,
    reconnectPeriod: 1000,
    caCert: "",
    clientCert: "",
    clientKey: "",
  };
}
