"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const app_1 = __importDefault(require("./app"));
const storage_1 = require("./lib/storage");
const PORT = process.env.PORT || 3000;
app_1.default.listen(PORT, async () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    // Garante a criação dos buckets no Supabase Storage
    await storage_1.StorageService.ensureBucketsExist();
});
