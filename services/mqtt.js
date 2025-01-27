const mqtt = require("mqtt");
const config = require("../config/index");
const topics = require("../config/topics");
const dataHandling = require("../utils/dataHandling");
const dataCache = require("./cache");
const webSocketsService = require("./webSockets");

const url = `mqtts://${config.mqtt.MQTT_HOST}:${config.mqtt.MQTT_PORT}`;

let mqttClient = null;
let reconnecting = false;
let messageHandler = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let isManuallyReconnecting = false;

const connect = () => {
  mqttClient = mqtt.connect(url, {
    username: config.mqtt.MQTT_USERNAME,
    password: config.mqtt.MQTT_PASSWORD,
    rejectUnauthorized: false, // REMOVE THIS FOR PRODUCTION PURPOSE
    reconnectPeriod: 5000, // Retry every 5 seconds
    connectTimeout: 30 * 1000, // 30 seconds
    clean: true,
    resubscribe: true,
  });

  mqttClient.on("connect", () => {
    console.log("MQTT client connected " + url);
    webSocketsService.emitToAll("mqttStatus", { status: "connected" });
    reconnecting = false;
    reconnectAttempts = 0; // Reset attempts on successful connection
    isManuallyReconnecting = false;

    mqttClient.subscribe(topics, (err) => {
      if (err) {
        console.error("MQTT Subscription Error:", err);
        webSocketsService.emitToAll("mqttStatus", {
          status: "subscriptionError",
          error: err.message,
        });
      } else {
        console.log("Subscribed to topics");
        webSocketsService.emitToAll("mqttStatus", { status: "subscribed" });
      }
    });
  });

  mqttClient.on("message", (topic, message) => {
    try {
      const processedData = dataHandling.processData(topic, message);
      const boardId = processedData.tags.board_id;
      const sensorType = processedData.measurement;

      if (boardId && sensorType) {
        dataCache.updateSensorData(boardId, sensorType, processedData);
      }

      if (messageHandler) {
        messageHandler(boardId, topic, processedData);
      }
    } catch (err) {
      console.error("MQTT Message Processing Error:", err);
      webSocketsService.emitToAll("mqttStatus", {
        status: "messageError",
        error: err.message,
      });
    }
  });

  mqttClient.on("error", (err) => {
    console.error("MQTT Connection Error:", err);
    webSocketsService.emitToAll("mqttStatus", {
      status: "error",
      error: err.message,
    });
  });

  mqttClient.on("reconnect", () => {
    reconnectAttempts++;
    reconnecting = true;
    console.log(`MQTT client reconnecting... Attempt ${reconnectAttempts}`);

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log("Max reconnection attempts reached. Disconnecting client.");
      webSocketsService.emitToAll("mqttStatus", {
        status: "maxAttemptsReached",
      });

      disconnect(); // Disconnect after reaching max attempts
    } else {
      webSocketsService.emitToAll("mqttStatus", {
        status: "reconnecting",
        attempt: reconnectAttempts,
      });
    }
  });

  mqttClient.on("offline", () => {
    if (!reconnecting) {
      console.log("MQTT client is offline");
      webSocketsService.emitToAll("mqttStatus", { status: "offline" });
    }
  });

  mqttClient.on("close", () => {
    if (!reconnecting) {
      console.log("MQTT client disconnected");
      webSocketsService.emitToAll("mqttStatus", { status: "disconnected" });
    }
  });
};

const setMessageHandler = (handler) => {
  messageHandler = handler;
};

const disconnect = () => {
  if (mqttClient) {
    mqttClient.end(true, () => {
      console.log("MQTT client disconnected manually");
      webSocketsService.emitToAll("mqttStatus", { status: "disconnected" });
    });
  }
};

const manualReconnect = () => {
  if (isManuallyReconnecting) {
    console.log("Manual reconnection already in progress.");
    return;
  }

  console.log("Manually reconnecting MQTT client...");
  isManuallyReconnecting = true;

  disconnect(); // Ensure the client is disconnected before reconnecting

  setTimeout(() => {
    reconnectAttempts = 0; // Reset attempts for manual reconnection
    connect();
  }, 1000); // Delay to ensure a clean reconnection
};

module.exports = {
  connect,
  setMessageHandler,
  disconnect,
  manualReconnect,
};
