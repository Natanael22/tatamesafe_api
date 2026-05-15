"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const crypto_service_1 = require("../services/crypto.service");
const router = (0, express_1.Router)();
router.get('/public-key', (req, res) => {
    res.json({ key: crypto_service_1.CryptoService.getPublicKey() });
});
exports.default = router;
