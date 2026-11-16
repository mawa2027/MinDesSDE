"use strict";
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const multer = require("multer");
const config = require("./config");
const auth = require("./auth");
const { ErrorApp } = require("./errores");

const rutasAuth = require("./rutas/auth");
const rutasPublico = require("./rutas/publico");
const rutasContenidos = require("./rutas/contenidos");
const rutasBorradores = require("./rutas/borradores");
const rutasAuditoria = require("./rutas/auditoria");
const { auditar } = require("./auditoria/registro");

const MENSAJES_MULTER = {
  LIMIT_FILE_SIZE: "Un archivo supera el máximo de 10 MB.",
  LIMIT_FILE_COUNT: "Se permiten hasta 8 adjuntos por versión.",
  LIMIT_UNEXPECTED_FILE: "Los archivos deben enviarse en el campo «adjuntos».",
};

function manejarErrores(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error instanceof ErrorApp) {
    return res.status(error.estado).json({ error: { codigo: error.codigo, mensaje: error.message } });
  }
  if (error instanceof multer.MulterError) {
    const mensaje = MENSAJES_MULTER[error.code] || "No se pudieron procesar los archivos.";
    return res.status(400).json({ error: { codigo: "datos_invalidos", mensaje } });
  }
  if (error.type === "entity.parse.failed" || error.type === "entity.too.large") {
    return res.status(400).json({ error: { codigo: "datos_invalidos", mensaje: "El pedido no tiene un formato válido." } });
  }

  console.error(error);
  return res.status(500).json({ error: { codigo: "error_interno", mensaje: "Ocurrió un error inesperado. Probá de nuevo." } });
}

function crearApp() {
  const app = express();
  app.disable("x-powered-by");
  if (config.confiarProxy) app.set("trust proxy", config.confiarProxy);

  // Cabeceras de seguridad
  const directivas = helmet.contentSecurityPolicy.getDefaultDirectives();
  delete directivas["upgrade-insecure-requests"];
  app.use(helmet({
    contentSecurityPolicy: { directives: directivas },
    strictTransportSecurity: config.produccion,
  }));

  // API
  app.use("/api", auth.verificarOrigen, express.json({ limit: "400kb" }), auth.cargarUsuario, auth.exigirClaveDefinitiva);
  app.use("/api", auditar);
  app.get("/api/salud", (req, res) => res.json({ ok: true }));
  app.use("/api/auth", rutasAuth);
  app.use("/api/publico", rutasPublico);
  app.use("/api", rutasAuditoria);
  app.use("/api", rutasBorradores);
  app.use("/api", rutasContenidos);

  // Config dinámico para el frontend (debe ir antes del static)
  app.get("/js/config.js", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.type("application/javascript").send(
      'window.Nexo = window.Nexo || {};\nwindow.Nexo.config = { modo: "servidor", urlApi: "/api" };\n'
    );
  });

  // Cabeceras CORS para los sitios satélite (antes del static, para que apliquen)
  app.use("/sitios", (req, res, next) => {
    res.set("Cross-Origin-Resource-Policy", "cross-origin");
    res.set("Access-Control-Allow-Origin", "*");
    next();
  });

  // Panel de gestión accesible desde /panel
  app.get("/panel", (req, res) => {
    res.redirect("/frontend/panel.html");
  });

  // Portal público en la raíz (landing del Ministerio con noticias)
  app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../../index.html"));
  });

  // Archivos estáticos (sirve /app completo: index.html, centro-dia.html, frontend/panel.html, etc.)
  app.use(express.static(config.carpetaFrontend, { dotfiles: "ignore" }));

  app.use(manejarErrores);
  return app;
}

module.exports = { crearApp };
