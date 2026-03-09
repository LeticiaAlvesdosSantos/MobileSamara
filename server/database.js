require('dotenv').config();
const mysql = require('mysql2');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'samara_agenda',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

const promisePool = pool.promise();

async function testConnection() {
    try {
        const connection = await promisePool.getConnection();
        console.log('Conectado ao MySQL (phpMyAdmin) com sucesso!');
        console.log(`   Banco: ${process.env.DB_NAME || 'samara_agenda'}`);
        connection.release();
        return true;
    } catch (error) {
        console.error('Erro ao conectar com MySQL:');
        console.error(`   ${error.message}`);
        console.error('\nVerifique:');
        console.error('   1. O XAMPP/WAMP está rodando?');
        console.error('   2. O MySQL está iniciado?');
        console.error('   3. Clique em "Start" no XAMPP Control Panel');
        return false;
    }
}

async function initDatabase() {
    try {
        console.log('\nInicializando banco de dados...');
        
        await promisePool.query(`USE ${process.env.DB_NAME || 'samara_agenda'}`);
        
        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                senha VARCHAR(255) NOT NULL,
                telefone VARCHAR(20),
                tipo ENUM('psicopedagogo', 'admin') DEFAULT 'psicopedagogo',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_email (email)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('Tabela "usuarios" criada/verificada');

        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS pacientes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                usuario_id INT NOT NULL,
                nome VARCHAR(100) NOT NULL,
                data_nascimento DATE,
                genero VARCHAR(20),
                telefone VARCHAR(20),
                email VARCHAR(100),
                responsavel VARCHAR(100),
                observacoes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
                INDEX idx_nome (nome),
                INDEX idx_usuario (usuario_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('Tabela "pacientes" criada/verificada');

        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS consultas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                usuario_id INT NOT NULL,
                paciente_id INT NOT NULL,
                data_consulta DATE NOT NULL,
                horario TIME NOT NULL,
                tipo VARCHAR(50),
                observacoes TEXT,
                status ENUM('agendado', 'confirmado', 'realizado', 'cancelado') DEFAULT 'agendado',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
                FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE,
                INDEX idx_data (data_consulta),
                INDEX idx_usuario (usuario_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('Tabela "consultas" criada/verificada');

        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS registros_sessao (
                id INT AUTO_INCREMENT PRIMARY KEY,
                usuario_id INT NOT NULL,
                consulta_id INT NOT NULL,
                paciente_id INT NOT NULL,
                data_sessao DATE NOT NULL,
                observacoes TEXT,
                participacao INT CHECK (participacao >= 0 AND participacao <= 10),
                compreensao INT CHECK (compreensao >= 0 AND compreensao <= 10),
                progresso INT CHECK (progresso >= 0 AND progresso <= 10),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
                FOREIGN KEY (consulta_id) REFERENCES consultas(id) ON DELETE CASCADE,
                FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE,
                INDEX idx_paciente (paciente_id),
                INDEX idx_usuario (usuario_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('Tabela "registros_sessao" criada/verificada');

        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS audios (
                id INT AUTO_INCREMENT PRIMARY KEY,
                usuario_id INT NOT NULL,
                registro_id INT NOT NULL,
                paciente_id INT NOT NULL,
                nome_arquivo VARCHAR(255) NOT NULL,
                caminho_arquivo VARCHAR(500) NOT NULL,
                duracao INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
                FOREIGN KEY (registro_id) REFERENCES registros_sessao(id) ON DELETE CASCADE,
                FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE,
                INDEX idx_registro (registro_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('Tabela "audios" criada/verificada');

        await promisePool.query(`
            CREATE TABLE IF NOT EXISTS lembretes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                consulta_id INT NOT NULL,
                tipo ENUM('email', 'notificacao', 'sms') DEFAULT 'notificacao',
                enviado BOOLEAN DEFAULT FALSE,
                data_envio TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (consulta_id) REFERENCES consultas(id) ON DELETE CASCADE,
                INDEX idx_consulta (consulta_id),
                INDEX idx_enviado (enviado)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('Tabela "lembretes" criada/verificada');

        console.log('\nBanco de dados inicializado com sucesso!\n');
        return true;
    } catch (error) {
        console.error('\nErro ao inicializar banco de dados:');
        console.error(`   ${error.message}`);
        return false;
    }
}

module.exports = { promisePool, testConnection, initDatabase };