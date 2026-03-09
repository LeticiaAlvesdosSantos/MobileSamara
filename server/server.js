require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { promisePool, testConnection, initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3002;

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dest = path.join(__dirname, '../uploads/audios/');
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
            console.log('Pasta de uploads criada:', dest);
        }
        cb(null, dest);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const filename = 'audio-' + uniqueSuffix + ext;
        console.log('Nome do arquivo gerado:', filename);
        cb(null, filename);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { 
        fileSize: 50 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('audio/')) {
            cb(null, true);
        } else {
            cb(new Error('Apenas arquivos de áudio são permitidos'));
        }
    }
});

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use((req, res, next) => {
    console.log(`\n${req.method} ${req.url}`);
    if (req.method === 'POST' || req.method === 'PUT') {
        console.log('Body recebido:', JSON.stringify(req.body, null, 2));
    }
    next();
});

app.use(express.static(path.join(__dirname, '..')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.post('/api/registrar', async (req, res) => {
    try {
        console.log('Tentativa de registro:', req.body);
        
        const { nome, email, senha, telefone } = req.body;
        
        if (!nome || !email || !senha) {
            return res.status(400).json({ 
                success: false, 
                message: 'Nome, e-mail e senha são obrigatórios' 
            });
        }
        
        const [existing] = await promisePool.query(
            'SELECT id FROM usuarios WHERE email = ?',
            [email]
        );
        
        if (existing.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'E-mail já cadastrado' 
            });
        }
        
        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(senha, salt);
        
        const [result] = await promisePool.query(
            'INSERT INTO usuarios (nome, email, senha, telefone) VALUES (?, ?, ?, ?)',
            [nome, email, senhaHash, telefone || '']
        );
        
        console.log('Usuário registrado com ID:', result.insertId);
        
        res.status(201).json({ 
            success: true, 
            message: 'Usuário registrado com sucesso',
            id: result.insertId
        });
        
    } catch (error) {
        console.error('Erro no cadastro:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro interno do servidor' 
        });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        console.log('Tentativa de login:', req.body.email);
        
        const { email, senha } = req.body;
        
        const [rows] = await promisePool.query(
            'SELECT * FROM usuarios WHERE email = ?',
            [email]
        );
        
        if (rows.length === 0) {
            console.log('Usuário não encontrado:', email);
            return res.status(401).json({ 
                success: false, 
                message: 'Usuário não encontrado' 
            });
        }
        
        const usuario = rows[0];
        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        
        if (!senhaValida) {
            console.log('Senha incorreta para:', email);
            return res.status(401).json({ 
                success: false, 
                message: 'Senha incorreta' 
            });
        }
        
        delete usuario.senha;
        
        console.log('Login bem-sucedido:', usuario.nome);
        
        res.json({ 
            success: true, 
            usuario,
            message: 'Login realizado com sucesso' 
        });
        
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro interno do servidor' 
        });
    }
});

app.get('/api/perfil/:id', async (req, res) => {
    try {
        console.log('Buscando perfil ID:', req.params.id);
        
        const [rows] = await promisePool.query(
            'SELECT id, nome, email, telefone, tipo, created_at as createdAt FROM usuarios WHERE id = ?',
            [req.params.id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
        }
        
        res.json(rows[0]);
    } catch (error) {
        console.error('Erro ao buscar perfil:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor' });
    }
});

app.put('/api/perfil/:id', async (req, res) => {
    try {
        console.log('Atualizando perfil ID:', req.params.id, req.body);
        
        const { nome, email, telefone } = req.body;
        
        if (email) {
            const [existing] = await promisePool.query(
                'SELECT id FROM usuarios WHERE email = ? AND id != ?',
                [email, req.params.id]
            );
            
            if (existing.length > 0) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'E-mail já está em uso' 
                });
            }
        }
        
        await promisePool.query(
            'UPDATE usuarios SET nome = ?, email = ?, telefone = ? WHERE id = ?',
            [nome, email, telefone, req.params.id]
        );
        
        const [updated] = await promisePool.query(
            'SELECT id, nome, email, telefone, tipo, created_at as createdAt FROM usuarios WHERE id = ?',
            [req.params.id]
        );
        
        console.log('Perfil atualizado:', updated[0].nome);
        
        res.json({ 
            success: true, 
            usuario: updated[0],
            message: 'Perfil atualizado com sucesso'
        });
        
    } catch (error) {
        console.error('Erro ao atualizar perfil:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor' });
    }
});

app.post('/api/alterar-senha', async (req, res) => {
    try {
        console.log('Tentativa de alterar senha - usuário:', req.body.usuario_id);
        
        const { usuario_id, senha_atual, nova_senha } = req.body;
        
        const [rows] = await promisePool.query(
            'SELECT senha FROM usuarios WHERE id = ?',
            [usuario_id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
        }
        
        const senhaValida = await bcrypt.compare(senha_atual, rows[0].senha);
        
        if (!senhaValida) {
            return res.status(401).json({ success: false, message: 'Senha atual incorreta' });
        }
        
        const salt = await bcrypt.genSalt(10);
        const novaSenhaHash = await bcrypt.hash(nova_senha, salt);
        
        await promisePool.query(
            'UPDATE usuarios SET senha = ? WHERE id = ?',
            [novaSenhaHash, usuario_id]
        );
        
        console.log('Senha alterada com sucesso para usuário:', usuario_id);
        
        res.json({ success: true, message: 'Senha alterada com sucesso' });
        
    } catch (error) {
        console.error('Erro ao alterar senha:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor' });
    }
});

app.get('/api/pacientes', async (req, res) => {
    try {
        const { usuario_id } = req.query;
        console.log('Buscando pacientes para usuário:', usuario_id);
        
        if (!usuario_id) {
            return res.status(400).json({ error: 'ID do usuário é obrigatório' });
        }
        
        const [rows] = await promisePool.query(`
            SELECT p.*, 
                   COUNT(DISTINCT c.id) as total_consultas,
                   MAX(c.data_consulta) as ultima_consulta
            FROM pacientes p
            LEFT JOIN consultas c ON p.id = c.paciente_id
            WHERE p.usuario_id = ?
            GROUP BY p.id
            ORDER BY p.nome
        `, [usuario_id]);
        
        console.log(`Encontrados ${rows.length} pacientes`);
        res.json(rows);
    } catch (error) {
        console.error('Erro ao buscar pacientes:', error);
        res.status(500).json({ error: 'Erro ao buscar pacientes' });
    }
});

app.get('/api/pacientes/:id', async (req, res) => {
    try {
        console.log('Buscando paciente ID:', req.params.id);
        
        const [rows] = await promisePool.query(
            'SELECT * FROM pacientes WHERE id = ?',
            [req.params.id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Paciente não encontrado' });
        }
        
        res.json(rows[0]);
    } catch (error) {
        console.error('Erro ao buscar paciente:', error);
        res.status(500).json({ error: 'Erro ao buscar paciente' });
    }
});

app.post('/api/pacientes', async (req, res) => {
    try {
        console.log('Criando novo paciente:', req.body);
        
        const { usuario_id, nome, data_nascimento, genero, telefone, email, responsavel, observacoes } = req.body;
        
        const [result] = await promisePool.query(
            `INSERT INTO pacientes 
             (usuario_id, nome, data_nascimento, genero, telefone, email, responsavel, observacoes) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [usuario_id, nome, data_nascimento, genero, telefone, email, responsavel, observacoes]
        );
        
        const [novoPaciente] = await promisePool.query(
            'SELECT * FROM pacientes WHERE id = ?',
            [result.insertId]
        );
        
        console.log('Paciente criado com ID:', result.insertId);
        
        res.status(201).json(novoPaciente[0]);
    } catch (error) {
        console.error('Erro ao criar paciente:', error);
        res.status(500).json({ error: 'Erro ao criar paciente' });
    }
});

app.put('/api/pacientes/:id', async (req, res) => {
    try {
        console.log('Atualizando paciente ID:', req.params.id, req.body);
        
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
        
        console.log('Paciente atualizado:', pacienteAtualizado[0].nome);
        
        res.json(pacienteAtualizado[0]);
    } catch (error) {
        console.error('Erro ao atualizar paciente:', error);
        res.status(500).json({ error: 'Erro ao atualizar paciente' });
    }
});

app.delete('/api/pacientes/:id', async (req, res) => {
    try {
        console.log('Deletando paciente ID:', req.params.id);
        
        await promisePool.query('DELETE FROM pacientes WHERE id = ?', [req.params.id]);
        
        console.log('Paciente deletado');
        res.json({ success: true, message: 'Paciente removido com sucesso' });
    } catch (error) {
        console.error('Erro ao deletar paciente:', error);
        res.status(500).json({ error: 'Erro ao deletar paciente' });
    }
});

app.get('/api/consultas', async (req, res) => {
    try {
        const { data, paciente_id, usuario_id } = req.query;
        
        if (!usuario_id) {
            return res.status(400).json({ error: 'ID do usuário é obrigatório' });
        }
        
        console.log('Buscando consultas para usuário:', usuario_id, 'data:', data, 'paciente:', paciente_id);
        
        let query = `
            SELECT c.*, p.nome as paciente_nome 
            FROM consultas c
            JOIN pacientes p ON c.paciente_id = p.id
            WHERE c.usuario_id = ?
        `;
        let params = [usuario_id];
        
        if (data) {
            query += ' AND c.data_consulta = ?';
            params.push(data);
        }
        
        if (paciente_id) {
            query += ' AND c.paciente_id = ?';
            params.push(paciente_id);
        }
        
        query += ' ORDER BY c.data_consulta DESC, c.horario';
        
        const [rows] = await promisePool.query(query, params);
        console.log(`Encontradas ${rows.length} consultas`);
        res.json(rows);
        
    } catch (error) {
        console.error('Erro ao buscar consultas:', error);
        res.status(500).json({ 
            error: 'Erro ao buscar consultas',
            details: error.message 
        });
    }
});

app.post('/api/consultas', async (req, res) => {
    try {
        console.log('\n' + '='.repeat(60));
        console.log('DADOS RECEBIDOS PARA CRIAÇÃO DE CONSULTA:');
        console.log('='.repeat(60));
        console.log(JSON.stringify(req.body, null, 2));
        console.log('='.repeat(60));
        
        const { usuario_id, paciente_id, data_consulta, horario, tipo, observacoes } = req.body;
        
        const erros = [];
        
        if (!usuario_id) erros.push('usuario_id é obrigatório');
        if (!paciente_id) erros.push('paciente_id é obrigatório');
        if (!data_consulta) erros.push('data_consulta é obrigatório');
        if (!horario) erros.push('horario é obrigatório');
        
        if (erros.length > 0) {
            console.log('ERROS DE VALIDAÇÃO:', erros);
            return res.status(400).json({ 
                success: false, 
                message: 'Dados incompletos',
                erros: erros 
            });
        }
        
        const [paciente] = await promisePool.query(
            'SELECT id FROM pacientes WHERE id = ? AND usuario_id = ?',
            [paciente_id, usuario_id]
        );
        
        if (paciente.length === 0) {
            console.log('Paciente não encontrado ou não pertence ao usuário');
            return res.status(400).json({ 
                success: false, 
                message: 'Paciente não encontrado' 
            });
        }
        
        const [existentes] = await promisePool.query(
            'SELECT id FROM consultas WHERE usuario_id = ? AND data_consulta = ? AND horario = ?',
            [usuario_id, data_consulta, horario]
        );
        
        if (existentes.length > 0) {
            console.log('Conflito de horário detectado');
            return res.status(400).json({ 
                success: false, 
                message: 'Já existe uma consulta neste horário' 
            });
        }
        
        const [result] = await promisePool.query(
            `INSERT INTO consultas 
             (usuario_id, paciente_id, data_consulta, horario, tipo, observacoes, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [usuario_id, paciente_id, data_consulta, horario, tipo || 'Consulta', observacoes || '', 'agendado']
        );
        
        console.log('CONSULTA CRIADA COM SUCESSO! ID:', result.insertId);
        
        await promisePool.query(
            'INSERT INTO lembretes (consulta_id) VALUES (?)',
            [result.insertId]
        );
        
        console.log('Lembrete criado para a consulta');
        
        const [novaConsulta] = await promisePool.query(`
            SELECT c.*, p.nome as paciente_nome 
            FROM consultas c
            JOIN pacientes p ON c.paciente_id = p.id
            WHERE c.id = ?
        `, [result.insertId]);
        
        res.status(201).json({ 
            success: true, 
            message: 'Consulta agendada com sucesso!',
            consulta: novaConsulta[0]
        });
        
    } catch (error) {
        console.error('ERRO AO CRIAR CONSULTA:');
        console.error('Mensagem:', error.message);
        console.error('SQL:', error.sql);
        console.error('Stack:', error.stack);
        
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao criar consulta',
            message: error.message 
        });
    }
});

app.delete('/api/consultas/:id', async (req, res) => {
    try {
        const consultaId = req.params.id;
        
        console.log('Tentando cancelar consulta ID:', consultaId);
        
        const [consulta] = await promisePool.query(
            'SELECT * FROM consultas WHERE id = ?',
            [consultaId]
        );
        
        if (consulta.length === 0) {
            console.log('Consulta não encontrada:', consultaId);
            return res.status(404).json({ 
                success: false, 
                message: 'Consulta não encontrada' 
            });
        }
        
        await promisePool.query('DELETE FROM consultas WHERE id = ?', [consultaId]);
        
        console.log('Consulta cancelada com sucesso:', consultaId);
        
        res.json({ 
            success: true, 
            message: 'Consulta cancelada com sucesso' 
        });
        
    } catch (error) {
        console.error('Erro ao cancelar consulta:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro interno ao cancelar consulta',
            error: error.message 
        });
    }
});

app.get('/api/registros', async (req, res) => {
    try {
        const { usuario_id, paciente_id } = req.query;
        
        if (!usuario_id) {
            return res.status(400).json({ error: 'ID do usuário é obrigatório' });
        }
        
        console.log('Buscando registros para usuário:', usuario_id, 'paciente:', paciente_id);
        
        let query = `
            SELECT r.*, p.nome as paciente_nome 
            FROM registros_sessao r
            JOIN pacientes p ON r.paciente_id = p.id
            WHERE r.usuario_id = ?
        `;
        let params = [usuario_id];
        
        if (paciente_id) {
            query += ' AND r.paciente_id = ?';
            params.push(paciente_id);
        }
        
        query += ' ORDER BY r.data_sessao DESC';
        
        const [rows] = await promisePool.query(query, params);
        console.log(`Encontrados ${rows.length} registros`);
        res.json(rows);
        
    } catch (error) {
        console.error('Erro ao buscar registros:', error);
        res.status(500).json({ 
            error: 'Erro ao buscar registros', 
            details: error.message 
        });
    }
});

app.post('/api/registros', async (req, res) => {
    try {
        console.log('\n' + '='.repeat(60));
        console.log('DADOS RECEBIDOS NO SERVIDOR:');
        console.log('='.repeat(60));
        console.log(JSON.stringify(req.body, null, 2));
        console.log('='.repeat(60));
        
        const { usuario_id, consulta_id, paciente_id, data_sessao, observacoes, participacao, compreensao, progresso } = req.body;
        
        const erros = [];
        if (!usuario_id) erros.push('usuario_id é obrigatório');
        if (!paciente_id) erros.push('paciente_id é obrigatório');
        if (!data_sessao) erros.push('data_sessao é obrigatório');
        
        const participacaoInt = participacao !== undefined ? parseInt(participacao) : 5;
        const compreensaoInt = compreensao !== undefined ? parseInt(compreensao) : 5;
        const progressoInt = progresso !== undefined ? parseInt(progresso) : 5;
        
        if (erros.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Dados incompletos ou inválidos',
                erros: erros 
            });
        }
        
        const dadosInserir = {
            usuario_id: usuario_id,
            consulta_id: consulta_id || null,
            paciente_id: paciente_id,
            data_sessao: data_sessao,
            observacoes: observacoes || '',
            participacao: participacaoInt,
            compreensao: compreensaoInt,
            progresso: progressoInt
        };
        
        const sql = `
            INSERT INTO registros_sessao 
            (usuario_id, consulta_id, paciente_id, data_sessao, observacoes, participacao, compreensao, progresso) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const params = [
            dadosInserir.usuario_id,
            dadosInserir.consulta_id,
            dadosInserir.paciente_id,
            dadosInserir.data_sessao,
            dadosInserir.observacoes,
            dadosInserir.participacao,
            dadosInserir.compreensao,
            dadosInserir.progresso
        ];
        
        const [result] = await promisePool.query(sql, params);
        
        console.log('\nREGISTRO INSERIDO COM SUCESSO! ID:', result.insertId);
        
        if (consulta_id) {
            await promisePool.query(
                'UPDATE consultas SET status = ? WHERE id = ?',
                ['realizado', consulta_id]
            );
        }
        
        res.status(201).json({ 
            success: true, 
            id: result.insertId,
            message: 'Registro salvo com sucesso' 
        });
        
    } catch (error) {
        console.error('ERRO AO CRIAR REGISTRO:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao criar registro',
            message: error.message
        });
    }
});

app.delete('/api/registros/:id', async (req, res) => {
    try {
        const registroId = req.params.id;
        const { usuario_id } = req.query;
        
        console.log('Tentando excluir registro ID:', registroId, 'Usuário:', usuario_id);
        
        const [registro] = await promisePool.query(
            'SELECT * FROM registros_sessao WHERE id = ?',
            [registroId]
        );
        
        if (registro.length === 0) {
            console.log('Registro não encontrado:', registroId);
            return res.status(404).json({ 
                success: false, 
                message: 'Registro não encontrado' 
            });
        }
        
        if (usuario_id && registro[0].usuario_id != usuario_id) {
            console.log('Permissão negada - registro pertence a outro usuário');
            return res.status(403).json({ 
                success: false, 
                message: 'Você não tem permissão para excluir este registro' 
            });
        }
        
        await promisePool.query('DELETE FROM registros_sessao WHERE id = ?', [registroId]);
        
        console.log('Registro excluído com sucesso:', registroId);
        
        res.json({ 
            success: true, 
            message: 'Registro excluído com sucesso' 
        });
        
    } catch (error) {
        console.error('Erro ao excluir registro:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro interno ao excluir registro',
            error: error.message 
        });
    }
});

app.get('/api/audios/registro/:registro_id', async (req, res) => {
    try {
        const { registro_id } = req.params;
        const { usuario_id } = req.query;
        
        console.log('Buscando áudios do registro:', registro_id, 'usuário:', usuario_id);
        
        if (!usuario_id) {
            return res.status(400).json({ error: 'ID do usuário é obrigatório' });
        }
        
        const [rows] = await promisePool.query(
            `SELECT * FROM audios 
             WHERE registro_id = ? AND usuario_id = ?
             ORDER BY created_at DESC`,
            [registro_id, usuario_id]
        );
        
        console.log(`Encontrados ${rows.length} áudios`);
        res.json(rows);
        
    } catch (error) {
        console.error('Erro ao buscar áudios:', error);
        res.status(500).json({ error: 'Erro ao buscar áudios' });
    }
});

app.post('/api/audios/upload', upload.single('audio'), async (req, res) => {
    try {
        console.log('Upload de áudio recebido');
        console.log('Body:', req.body);
        console.log('Arquivo:', req.file);
        
        const { usuario_id, registro_id, paciente_id } = req.body;
        const arquivo = req.file;
        
        if (!arquivo) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }
        
        await promisePool.query(
            `INSERT INTO audios 
             (usuario_id, registro_id, paciente_id, nome_arquivo, caminho_arquivo) 
             VALUES (?, ?, ?, ?, ?)`,
            [usuario_id, registro_id, paciente_id, arquivo.filename, arquivo.path]
        );
        
        console.log('Áudio salvo no banco de dados');
        
        res.json({ 
            success: true, 
            filename: arquivo.filename,
            message: 'Áudio salvo com sucesso' 
        });
    } catch (error) {
        console.error('Erro ao fazer upload:', error);
        res.status(500).json({ error: 'Erro ao fazer upload do áudio' });
    }
});

app.get('/api/lembretes/hoje', async (req, res) => {
    try {
        const { usuario_id } = req.query;
        const hoje = new Date().toISOString().split('T')[0];
        
        console.log('Buscando consultas para hoje:', hoje, 'usuário:', usuario_id);
        
        if (!usuario_id) {
            return res.status(400).json({ error: 'ID do usuário é obrigatório' });
        }
        
        const [rows] = await promisePool.query(`
            SELECT c.*, p.nome as paciente_nome, p.telefone
            FROM consultas c
            JOIN pacientes p ON c.paciente_id = p.id
            WHERE c.usuario_id = ? 
              AND c.data_consulta = ? 
              AND c.status != 'cancelado'
            ORDER BY c.horario
        `, [usuario_id, hoje]);
        
        console.log(`Encontradas ${rows.length} consultas para hoje`);
        res.json(rows);
    } catch (error) {
        console.error('Erro ao buscar lembretes:', error);
        res.status(500).json({ error: 'Erro ao buscar lembretes', details: error.message });
    }
});

app.get('/api/lembretes/proximos', async (req, res) => {
    try {
        const { usuario_id } = req.query;
        const hoje = new Date().toISOString().split('T')[0];
        
        console.log('Buscando próximas consultas para usuário:', usuario_id);
        
        if (!usuario_id) {
            return res.status(400).json({ error: 'ID do usuário é obrigatório' });
        }
        
        const [rows] = await promisePool.query(`
            SELECT c.*, p.nome as paciente_nome
            FROM consultas c
            JOIN pacientes p ON c.paciente_id = p.id
            WHERE c.usuario_id = ? 
              AND c.data_consulta > ? 
              AND c.status != 'cancelado'
            ORDER BY c.data_consulta, c.horario
            LIMIT 10
        `, [usuario_id, hoje]);
        
        console.log(`Encontradas ${rows.length} próximas consultas`);
        res.json(rows);
    } catch (error) {
        console.error('Erro ao buscar próximas consultas:', error);
        res.status(500).json({ error: 'Erro ao buscar próximas consultas', details: error.message });
    }
});

app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const { usuario_id } = req.query;
        const hoje = new Date().toISOString().split('T')[0];
        
        console.log('Buscando estatísticas para usuário:', usuario_id);
        
        if (!usuario_id) {
            return res.status(400).json({ error: 'ID do usuário é obrigatório' });
        }
        
        const [totalPacientes] = await promisePool.query(
            'SELECT COUNT(*) as total FROM pacientes WHERE usuario_id = ?',
            [usuario_id]
        );
        
        const [consultasHoje] = await promisePool.query(
            'SELECT COUNT(*) as total FROM consultas WHERE usuario_id = ? AND data_consulta = ? AND status != "cancelado"',
            [usuario_id, hoje]
        );
        
        const [proximasConsultas] = await promisePool.query(
            'SELECT COUNT(*) as total FROM consultas WHERE usuario_id = ? AND data_consulta >= ? AND status != "cancelado"',
            [usuario_id, hoje]
        );
        
        const [totalRegistros] = await promisePool.query(
            'SELECT COUNT(*) as total FROM registros_sessao WHERE usuario_id = ?',
            [usuario_id]
        );
        
        console.log('Estatísticas calculadas');
        
        res.json({
            totalPacientes: totalPacientes[0].total,
            consultasHoje: consultasHoje[0].total,
            totalConsultas: proximasConsultas[0].total,
            totalRegistros: totalRegistros[0].total
        });
    } catch (error) {
        console.error('Erro ao buscar estatísticas:', error);
        res.status(500).json({ error: 'Erro ao buscar estatísticas', details: error.message });
    }
});

app.get('/api/test', (req, res) => {
    res.json({ 
        message: 'API funcionando!',
        timestamp: new Date().toISOString(),
        status: 'online'
    });
});

async function startServer() {
    console.log('\n' + '='.repeat(60));
    console.log('INICIANDO SERVIDOR SAMARAAGENDA');
    console.log('='.repeat(60));
    
    const connected = await testConnection();
    
    if (connected) {
        console.log('Inicializando banco de dados...');
        await initDatabase();
        console.log('Banco de dados pronto!');
    } else {
        console.log('ATENÇÃO: Usando modo de fallback (db.json)');
        console.log('O sistema funcionará, mas sem persistência em MySQL');
    }
    
    const uploadDir = path.join(__dirname, '../uploads/audios');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
        console.log('Pasta de uploads criada:', uploadDir);
    } else {
        console.log('Pasta de uploads já existe:', uploadDir);
    }
    
    app.listen(PORT, () => {
        console.log('\n' + '='.repeat(60));
        console.log('SERVIDOR RODANDO COM SUCESSO!');
        console.log('='.repeat(60));
        console.log(`URL: http://localhost:${PORT}`);
        console.log(`Uploads: ${uploadDir}`);
        console.log(`Iniciado em: ${new Date().toLocaleString()}`);
        console.log('='.repeat(60) + '\n');
    });
}

startServer();