const express = require("express");
const axios = require("axios");
const cors = require("cors");
const app = express();

app.use(express.json());
app.use(
  cors({
    origin: "*",
  })
);

const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN ||
  "8542817539:AAFyMWYLoXWTaY2aIE_BASfhUx21JAkFZsM";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "-5021274664";
const API_KEY = process.env.API_KEY || "a8B3dE4F9gH2JkL5mN";
const API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

const CLIENT_ID = process.env.CLIENT_ID || "user1";

// Middleware de autorización
// app.use((req, res, next) => {
//     const apiKey = req.headers['x-api-key-authorization'];
//     const clientId = req.headers['x-client-id'];

//     if (apiKey !== API_KEY || clientId !== CLIENT_ID) {
//         return res.status(401).send('No autorizado');
//     }
//     next();
// });

function normalizeInlineKeyboard(kbd) {
  if (!kbd) return undefined;

  if (typeof kbd === "string") {
    try {
      kbd = JSON.parse(kbd);
    } catch {
      return undefined;
    }
  }
  if (Array.isArray(kbd?.inline_keyboard)) {
    const ik = Array.isArray(kbd.inline_keyboard[0])
      ? kbd.inline_keyboard
      : [kbd.inline_keyboard];
    return { inline_keyboard: ik };
  }
  if (Array.isArray(kbd)) {
    const ik = Array.isArray(kbd[0]) ? kbd : [kbd];
    return { inline_keyboard: ik };
  }
  return undefined;
}

app.post("/send-message", async (req, res) => {
  try {
    const { mensaje, teclado } = req.body;

    const reply_markup = normalizeInlineKeyboard(teclado);

    const tgResp = await axios.post(`${API_URL}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: mensaje,
      reply_markup,
      // parse_mode: "HTML",     // opcional
      // disable_notification: true
    });

    const result = tgResp.data?.result;
    if (!result) {
      return res.status(500).send("Respuesta inválida de Telegram");
    }

    return res.json({
      ok: true,
      message_id: result.message_id,
      date: result.date,
    });
  } catch (error) {
    console.error(error.response?.data || error.message);
    return res.status(500).send("Error al enviar mensaje");
  }
});

app.post("/wait-action", async (req, res) => {
  const { message_id, totalTimeoutMs, pollTimeoutSec, removeKeyboard } =
    req.body || {};
  if (!message_id)
    return res
      .status(400)
      .json({ ok: false, error: "message_id es requerido" });

  // Configuración por request (NO global)
  const TOTAL_TIMEOUT_MS = Math.max(1000, Number(totalTimeoutMs) || 25000);
  const POLL_TIMEOUT_SEC = Math.min(
    50,
    Math.max(1, Number(pollTimeoutSec) || 20)
  );
  const deadline = Date.now() + TOTAL_TIMEOUT_MS;

  // Función local: escanear un lote de updates y encontrar la callback del message_id
  const findDecisionIn = (updates) => {
    for (const u of updates) {
      const cq = u.callback_query;
      const cqMsg = cq?.message;
      if (cq && cqMsg && cqMsg.message_id === Number(message_id)) {
        return {
          update_id: u.update_id,
          callback_query_id: cq.id,
          action: cq.data,
          from: cq.from,
          message_id: cqMsg.message_id,
          chat_id: cqMsg.chat?.id,
        };
      }
    }
    return null;
  };

  try {
    // 1) PRIMERA PASADA: buscar si YA existe una decisión reciente en el backlog
    let initial = await axios.get(`${API_URL}/getUpdates`, {
      params: {
        timeout: 0,
        // allowed_updates para filtrar a callback_query y no "comer" mensajes
        allowed_updates: JSON.stringify(["callback_query"]),
      },
    });

    const initialUpdates = initial.data?.result || [];
    let lastUpdateId = initialUpdates.length
      ? initialUpdates[initialUpdates.length - 1].update_id
      : undefined;

    // ¿La decisión ya estaba?
    const foundInBacklog = findDecisionIn(initialUpdates);
    if (foundInBacklog) {
      // Opcionalmente, quitamos teclado y contestamos callback
      if (removeKeyboard) {
        // quitar teclado
        try {
          await axios.post(`${API_URL}/editMessageReplyMarkup`, {
            chat_id: foundInBacklog.chat_id,
            message_id: foundInBacklog.message_id,
            reply_markup: { inline_keyboard: [] },
          });
        } catch (e) {
          /* noop */
        }
      }
      // responder al tap (visual feedback del botón)
      try {
        await axios.post(`${API_URL}/answerCallbackQuery`, {
          callback_query_id: foundInBacklog.callback_query_id,
          text: "Recibido.",
        });
      } catch (e) {
        /* noop */
      }

      return res.json({
        ok: true,
        action: foundInBacklog.action,
        from: foundInBacklog.from,
        callback_query_id: foundInBacklog.callback_query_id,
        message_id: foundInBacklog.message_id,
      });
    }

    // 2) Si no estaba, arrancamos LONG-POLLING desde el último update conocido + 1
    let offset = (lastUpdateId ?? 0) + 1;

    while (Date.now() < deadline) {
      const remainingMs = deadline - Date.now();
      // Ajusta timeout del poll para no exceder el total
      const thisPollSec = Math.max(
        1,
        Math.min(POLL_TIMEOUT_SEC, Math.floor(remainingMs / 1000))
      );

      const poll = await axios.get(`${API_URL}/getUpdates`, {
        params: {
          offset,
          timeout: thisPollSec,
          allowed_updates: JSON.stringify(["callback_query"]),
        },
      });

      const result = poll.data?.result || [];
      if (result.length > 0) {
        // Avanza offset para el siguiente ciclo
        offset = result[result.length - 1].update_id + 1;

        const found = findDecisionIn(result);
        if (found) {
          if (removeKeyboard) {
            try {
              await axios.post(`${API_URL}/editMessageReplyMarkup`, {
                chat_id: found.chat_id,
                message_id: found.message_id,
                reply_markup: { inline_keyboard: [] },
              });
            } catch (e) {
              /* noop */
            }
          }
          try {
            await axios.post(`${API_URL}/answerCallbackQuery`, {
              callback_query_id: found.callback_query_id,
              text: "Recibido.",
            });
          } catch (e) {
            /* noop */
          }

          return res.json({
            ok: true,
            action: found.action,
            from: found.from,
            callback_query_id: found.callback_query_id,
            message_id: found.message_id,
          });
        }
      }
    }

    return res.status(200).json({ ok: false, reason: "timeout" });
  } catch (error) {
    console.error(error.response?.data || error.message);
    return res.status(500).json({ ok: false, error: "fallo en getUpdates" });
  }
});
// Iniciar servidor
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));






