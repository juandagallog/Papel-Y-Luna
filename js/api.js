const esLocalExterno =
  (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") &&
  window.location.port !== "8000";

const API_BASE_URL =
  window.PAPEL_LUNA_API_URL ||
  (esLocalExterno ? "http://127.0.0.1:8000/api" : `${window.location.origin}/api`);

async function fetchConTimeout(url, opciones = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const temporizador = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const headers = {
      ...(opciones.headers || {}),
    };
    if (opciones.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const respuesta = await fetch(url, {
      ...opciones,
      headers,
      credentials: "include",
      signal: controller.signal,
    });

    const texto = await respuesta.text();
    return { respuesta, texto };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("El servidor tardó demasiado en responder.");
    }
    throw new Error("No se pudo conectar con el servidor backend (verifica que Django esté ejecutándose).");
  } finally {
    clearTimeout(temporizador);
  }
}

function parsearRespuestaJson(respuesta, texto) {
  let json = null;
  if (texto) {
    try {
      json = JSON.parse(texto);
    } catch {
      throw new Error(`Respuesta inválida del servidor (HTTP ${respuesta.status}).`);
    }
  }

  if (!respuesta.ok) {
    const mensaje =
      (json && (json.message || json.detail)) ||
      `Error HTTP ${respuesta.status}`;
    if (respuesta.status === 401 && typeof window.mostrarModalLogin === "function") {
      window.mostrarModalLogin();
    }
    throw new Error(mensaje);
  }

  return json;
}

// GET REST hacia /api/<resource>/ (soporta query string opcional)
async function apiGet(resource, params = null) {
  const limpio = String(resource).replace(/^\/+|\/+$/g, "");
  let url = `${API_BASE_URL}/${limpio}/`;
  if (params && typeof params === "object") {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v) !== "") {
        qs.append(k, String(v));
      }
    });
    const str = qs.toString();
    if (str) url += `?${str}`;
  }

  const { respuesta, texto } = await fetchConTimeout(url, {
    method: "GET",
    cache: "no-store",
  });
  return parsearRespuestaJson(respuesta, texto);
}

// Mapea create -> POST, update -> PUT, delete -> DELETE hacia rutas REST
async function apiPost(resource, action, data = {}) {
  const limpio = String(resource).replace(/^\/+|\/+$/g, "");
  let url = `${API_BASE_URL}/${limpio}/`;
  let method = "POST";
  let bodyObj = data;

  if (action === "create") {
    method = "POST";
  } else if (action === "update") {
    if (!data || !data.id) {
      throw new Error("Se requiere el id del registro para actualizar.");
    }
    url = `${API_BASE_URL}/${limpio}/${encodeURIComponent(data.id)}/`;
    method = "PUT";
  } else if (action === "delete") {
    if (!data || !data.id) {
      throw new Error("Se requiere el id del registro para eliminar.");
    }
    url = `${API_BASE_URL}/${limpio}/${encodeURIComponent(data.id)}/`;
    method = "DELETE";
    bodyObj = null;
  } else {
    throw new Error(`Acción no soportada: ${action}`);
  }

  const opciones = {
    method,
    cache: "no-store",
  };
  if (bodyObj !== null) {
    opciones.body = JSON.stringify(bodyObj);
  }

  const { respuesta, texto } = await fetchConTimeout(url, opciones);
  return parsearRespuestaJson(respuesta, texto);
}

// --- Endpoints específicos del MVP 3 ---

async function apiAuthSession() {
  return apiGet("auth/session");
}

async function apiAuthLogin(username, password) {
  const { respuesta, texto } = await fetchConTimeout(
    `${API_BASE_URL}/auth/login/`,
    {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }
  );
  return parsearRespuestaJson(respuesta, texto);
}

async function apiAuthLogout() {
  const { respuesta, texto } = await fetchConTimeout(
    `${API_BASE_URL}/auth/logout/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
  return parsearRespuestaJson(respuesta, texto);
}

async function apiCorregirVenta(ventaId, payload) {
  const { respuesta, texto } = await fetchConTimeout(
    `${API_BASE_URL}/ventas/${encodeURIComponent(ventaId)}/corregir/`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
  return parsearRespuestaJson(respuesta, texto);
}

async function apiRegistrarReembolso(ventaId, payload) {
  const { respuesta, texto } = await fetchConTimeout(
    `${API_BASE_URL}/ventas/${encodeURIComponent(ventaId)}/reembolsos/`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
  return parsearRespuestaJson(respuesta, texto);
}