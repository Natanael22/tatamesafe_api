"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../lib/prisma"));
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// Pública - Lista academias certificadas
router.get('/', async (req, res) => {
    try {
        const academias = await prisma_1.default.academia.findMany({
            where: { ativa: true, verificada: true },
            select: { id: true, nome: true, endereco: true, nivel_selo: true, foto_url: true }
        });
        res.json(academias);
    }
    catch (error) {
        res.status(500).json({ error: 'Erro interno ao buscar academias' });
    }
});
// Pública - Perfil da academia
router.get('/:id', async (req, res) => {
    try {
        const academia = await prisma_1.default.academia.findUnique({
            where: { id: req.params.id },
            include: { certificados: true, avaliacoes: true }
        });
        if (!academia)
            return res.status(404).json({ error: 'Academia não encontrada' });
        res.json(academia);
    }
    catch (error) {
        res.status(500).json({ error: 'Erro interno ao buscar academia' });
    }
});
// Privada (Academia) - Cadastro
router.post('/', auth_middleware_1.requireAuth, async (req, res) => {
    try {
        // Para simplificar, assumimos o user_id vindo do token decodificado
        // const userId = req.user.id;
        // ... criação no db
        res.status(201).json({ message: 'Academia criada com sucesso' });
    }
    catch (error) {
        res.status(500).json({ error: 'Erro ao criar academia' });
    }
});
exports.default = router;
