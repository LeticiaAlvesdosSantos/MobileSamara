const express = require('express');
const router = express.Router();
const { promisePool } = require('./database');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/audios/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'audio-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('audio/')) {
            cb(null, true);
        } else {
            cb(new Error('Apenas arquivos de áudio são permitidos'));
        }
    }
});

router.post('/auth/registrar', async (req, res) => {
    try {
        const { nome, email, senha } = req.body;
        
        const [existing] = await promisePool.query(
            'SELECT id FROM usuarios WHERE email = ?',
            [email]
        );
        
        if (existing.length > 0) {
            return res.status(400).json({ error: 'E-mail já cadastrado' });
        }
        
        const hashedPassword = await bcrypt.hash(senha, 10);
        
        const [result] = await promisePool.query(
            'INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)',
            [nome, email, hashedPassword]
        );
        
        res.status(201).json({ 
            success: true, 
            message: 'Usuário registrado com sucesso',
            id: result.insertId 
        });
    } catch (error) {
        console.error('Erro ao registrar:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

router.post('/auth/login', async (req, res) => {
    try {
        const { email, senha } = req.body;
        
        const [rows] = await promisePool.query(
            'SELECT * FROM usuarios WHERE email = ?',
            [email]
        );
        
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Usuário não encontrado' });
        }
        
        const usuario = rows[0];
        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        
        if (!senhaValida) {
            return res.status(401).json({ error: 'Senha incorreta' });
        }
        
        delete usuario.senha;
        
        res.json({ 
            success: true, 
            usuario,
            message: 'Login realizado com sucesso' 
        });
    } catch (error) {
        console.error('Erro ao fazer login:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

router.get('/pacientes', async (req, res) => {
    try {
        const [rows] = await promisePool.query(`
            SELECT p.*, 
                   COUNT(DISTINCT c.id) as total_consultas,
                   MAX(c.data_consulta) as ultima_consulta
            FROM pacientes p
            LEFT JOIN consultas c ON p.id = c.paciente_id
            GROUP BY p.id
            ORDER BY p.nome
        `);
        res.json(rows);
    } catch (error) {
        console.error('Erro ao buscar pacientes:', error);
        res.status(500).json({ error: 'Erro ao buscar pacientes' });
    }
});

router.get('/pacientes/:id', async (req, res) => {
    try {
        const [rows] = await promisePool.query(
            'SELECT * FROM pacientes WHERE id = ?',
            [req.params.id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Paciente não encontrado' });
        }
        
        res.json(rows[0]);
    } catch (error) {
        console.error('Erro ao buscar paciente:', error);
        res.status(500).json({ error: 'Erro ao buscar paciente' });
    }
});

router.post('/pacientes', async (req, res) => {
    try {
        const { nome, data_nascimento, genero, telefone, email, responsavel, observacoes } = req.body;
        
        const [result] = await promisePool.query(
            `INSERT INTO pacientes 
             (nome, data_nascimento, genero, telefone, email, responsavel, observacoes) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [nome, data_nascimento, genero, telefone, email, responsavel, observacoes]
        );
        
        const [novoPaciente] = await promisePool.query(
            'SELECT * FROM pacientes WHERE id = ?',
            [result.insertId]
        );
        
        res.status(201).json(novoPaciente[0]);
    } catch (error) {
        console.error('Erro ao criar paciente:', error);
        res.status(500).json({ error: 'Erro ao criar paciente' });
    }
});

router.put('/pacientes/:id', async (req, res) => {
    try {
        const { nome, data_nascimento, genero, telefone, email, responsavel, observacoes } = req.body;
        
        await promisePool.query(
            `UPDATE pacientes SET 
             nome = ?, data_nascimento = ?, genero = ?, 
             telefone = ?, email = ?, responsavel = ?, observacoes = ?
             WHERE id = ?`,
            [nome, data_nascimento, genero, telefone, email, responsavel, observacoes, req.params.id]
        );
        
        const [pacienteAtualizado] = await promisePool.query(
            'SELECT * FROM pacientes WHERE id = ?',
            [req.params.id]
        );
        
        res.json(pacienteAtualizado[0]);
    } catch (error) {
        console.error('Erro ao atualizar paciente:', error);
        res.status(500).json({ error: 'Erro ao atualizar paciente' });
    }
});

router.delete('/pacientes/:id', async (req, res) => {
    try {
        await promisePool.query('DELETE FROM pacientes WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Paciente removido com sucesso' });
    } catch (error) {
        console.error('Erro ao deletar paciente:', error);
        res.status(500).json({ error: 'Erro ao deletar paciente' });
    }
});

router.get('/consultas', async (req, res) => {
    try {
        const { data, paciente_id } = req.query;
        let query = `
            SELECT c.*, p.nome as paciente_nome 
            FROM consultas c
            JOIN pacientes p ON c.paciente_id = p.id
        `;
        let params = [];
        
        if (data) {
            query += ' WHERE c.data_consulta = ?';
            params.push(data);
        }
        
        if (paciente_id) {
            query += data ? ' AND' : ' WHERE';
            query += ' c.paciente_id = ?';
            params.push(paciente_id);
        }
        
        query += ' ORDER BY c.data_consulta, c.horario';
        
        const [rows] = await promisePool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Erro ao buscar consultas:', error);
        res.status(500).json({ error: 'Erro ao buscar consultas' });
    }
});

router.post('/consultas', async (req, res) => {
    try {
        const { paciente_id, data_consulta, horario, tipo, observacoes } = req.body;
        
        const [existentes] = await promisePool.query(
            'SELECT id FROM consultas WHERE data_consulta = ? AND horario = ?',
            [data_consulta, horario]
        );
        
        if (existentes.length > 0) {
            return res.status(400).json({ error: 'Já existe uma consulta neste horário' });
        }
        
        const [result] = await promisePool.query(
            `INSERT INTO consultas 
             (paciente_id, data_consulta, horario, tipo, observacoes) 
             VALUES (?, ?, ?, ?, ?)`,
            [paciente_id, data_consulta, horario, tipo, observacoes]
        );
        
        await promisePool.query(
            'INSERT INTO lembretes (consulta_id, tipo) VALUES (?, ?)',
            [result.insertId, 'notificacao']
        );
        
        const [novaConsulta] = await promisePool.query(`
            SELECT c.*, p.nome as paciente_nome 
            FROM consultas c
            JOIN pacientes p ON c.paciente_id = p.id
            WHERE c.id = ?
        `, [result.insertId]);
        
        res.status(201).json(novaConsulta[0]);
    } catch (error) {
        console.error('Erro ao criar consulta:', error);
        res.status(500).json({ error: 'Erro ao criar consulta' });
    }
});

router.put('/consultas/:id', async (req, res) => {
    try {
        const { status, observacoes } = req.body;
        
        await promisePool.query(
            'UPDATE consultas SET status = ?, observacoes = ? WHERE id = ?',
            [status, observacoes, req.params.id]
        );
        
        const [consultaAtualizada] = await promisePool.query(`
            SELECT c.*, p.nome as paciente_nome 
            FROM consultas c
            JOIN pacientes p ON c.paciente_id = p.id
            WHERE c.id = ?
        `, [req.params.id]);
        
        res.json(consultaAtualizada[0]);
    } catch (error) {
        console.error('Erro ao atualizar consulta:', error);
        res.status(500).json({ error: 'Erro ao atualizar consulta' });
    }
});

router.delete('/consultas/:id', async (req, res) => {
    try {
        await promisePool.query('DELETE FROM consultas WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Consulta cancelada com sucesso' });
    } catch (error) {
        console.error('Erro ao cancelar consulta:', error);
        res.status(500).json({ error: 'Erro ao cancelar consulta' });
    }
});

router.get('/registros/paciente/:paciente_id', async (req, res) => {
    try {
        const [rows] = await promisePool.query(`
            SELECT r.*, c.data_consulta, c.horario 
            FROM registros_sessao r
            JOIN consultas c ON r.consulta_id = c.id
            WHERE r.paciente_id = ?
            ORDER BY r.data_sessao DESC
        `, [req.params.paciente_id]);
        
        res.json(rows);
    } catch (error) {
        console.error('Erro ao buscar registros:', error);
        res.status(500).json({ error: 'Erro ao buscar registros' });
    }
});

router.post('/registros', async (req, res) => {
    try {
        const { consulta_id, paciente_id, data_sessao, observacoes, participacao, compreensao, progresso } = req.body;
        
        const [result] = await promisePool.query(
            `INSERT INTO registros_sessao 
             (consulta_id, paciente_id, data_sessao, observacoes, participacao, compreensao, progresso) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [consulta_id, paciente_id, data_sessao, observacoes, participacao, compreensao, progresso]
        );
        
        await promisePool.query(
            'UPDATE consultas SET status = ? WHERE id = ?',
            ['realizado', consulta_id]
        );
        
        const [novoRegistro] = await promisePool.query(
            'SELECT * FROM registros_sessao WHERE id = ?',
            [result.insertId]
        );
        
        res.status(201).json(novoRegistro[0]);
    } catch (error) {
        console.error('Erro ao criar registro:', error);
        res.status(500).json({ error: 'Erro ao criar registro' });
    }
});

router.post('/audios/upload', upload.single('audio'), async (req, res) => {
    try {
        const { registro_id, paciente_id } = req.body;
        const arquivo = req.file;
        
        if (!arquivo) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }
        
        const [result] = await promisePool.query(
            `INSERT INTO audios 
             (registro_id, paciente_id, nome_arquivo, caminho_arquivo) 
             VALUES (?, ?, ?, ?)`,
            [registro_id, paciente_id, arquivo.filename, arquivo.path]
        );
        
        res.status(201).json({ 
            success: true, 
            id: result.insertId,
            filename: arquivo.filename 
        });
    } catch (error) {
        console.error('Erro ao fazer upload:', error);
        res.status(500).json({ error: 'Erro ao fazer upload do áudio' });
    }
});

router.get('/audios/registro/:registro_id', async (req, res) => {
    try {
        const [rows] = await promisePool.query(
            'SELECT * FROM audios WHERE registro_id = ?',
            [req.params.registro_id]
        );
        res.json(rows);
    } catch (error) {
        console.error('Erro ao buscar áudios:', error);
        res.status(500).json({ error: 'Erro ao buscar áudios' });
    }
});

router.get('/lembretes/hoje', async (req, res) => {
    try {
        const hoje = new Date().toISOString().split('T')[0];
        
        const [rows] = await promisePool.query(`
            SELECT c.*, p.nome as paciente_nome, p.telefone
            FROM consultas c
            JOIN pacientes p ON c.paciente_id = p.id
            WHERE c.data_consulta = ? AND c.status != 'cancelado'
            ORDER BY c.horario
        `, [hoje]);
        
        res.json(rows);
    } catch (error) {
        console.error('Erro ao buscar lembretes:', error);
        res.status(500).json({ error: 'Erro ao buscar lembretes' });
    }
});

router.get('/lembretes/proximos', async (req, res) => {
    try {
        const hoje = new Date().toISOString().split('T')[0];
        
        const [rows] = await promisePool.query(`
            SELECT c.*, p.nome as paciente_nome
            FROM consultas c
            JOIN pacientes p ON c.paciente_id = p.id
            WHERE c.data_consulta > ? AND c.status != 'cancelado'
            ORDER BY c.data_consulta, c.horario
            LIMIT 10
        `, [hoje]);
        
        res.json(rows);
    } catch (error) {
        console.error('Erro ao buscar próximas consultas:', error);
        res.status(500).json({ error: 'Erro ao buscar próximas consultas' });
    }
});

router.get('/dashboard/stats', async (req, res) => {
    try {
        const hoje = new Date().toISOString().split('T')[0];
        
        const [totalPacientes] = await promisePool.query('SELECT COUNT(*) as total FROM pacientes');
        
        const [consultasHoje] = await promisePool.query(
            'SELECT COUNT(*) as total FROM consultas WHERE data_consulta = ? AND status != ?',
            [hoje, 'cancelado']
        );
        
        const [proximasConsultas] = await promisePool.query(
            'SELECT COUNT(*) as total FROM consultas WHERE data_consulta > ? AND status != ?',
            [hoje, 'cancelado']
        );
        
        const [totalSessoes] = await promisePool.query(
            'SELECT COUNT(*) as total FROM registros_sessao'
        );
        
        const [consultasStatus] = await promisePool.query(`
            SELECT status, COUNT(*) as total 
            FROM consultas 
            GROUP BY status
        `);
        
        res.json({
            totalPacientes: totalPacientes[0].total,
            consultasHoje: consultasHoje[0].total,
            proximasConsultas: proximasConsultas[0].total,
            totalSessoes: totalSessoes[0].total,
            statusConsultas: consultasStatus
        });
    } catch (error) {
        console.error('Erro ao buscar estatísticas:', error);
        res.status(500).json({ error: 'Erro ao buscar estatísticas' });
    }
});

module.exports = router;