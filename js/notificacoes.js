class NotificationManager {
    constructor() {
        this.notifications = [];
        this.permission = false;
        this.checkPermission();
    }

    async checkPermission() {
        if (!('Notification' in window)) {
            console.log('Este navegador não suporta notificações');
            return false;
        }

        if (Notification.permission === 'granted') {
            this.permission = true;
        } else if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            this.permission = permission === 'granted';
        }

        return this.permission;
    }

    async requestPermission() {
        if (!('Notification' in window)) {
            alert('Seu navegador não suporta notificações');
            return false;
        }

        const permission = await Notification.requestPermission();
        this.permission = permission === 'granted';
        return this.permission;
    }

    sendNotification(title, options = {}) {
        if (!this.permission) {
            console.log('Sem permissão para enviar notificações');
            return null;
        }

        const defaultOptions = {
            body: '',
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            vibrate: [200, 100, 200],
            requireInteraction: true
        };

        const notificationOptions = { ...defaultOptions, ...options };
        
        try {
            const notification = new Notification(title, notificationOptions);
            
            notification.onclick = () => {
                window.focus();
                notification.close();
                this.onNotificationClick?.(notification);
            };

            notification.onclose = () => {
                this.onNotificationClose?.(notification);
            };

            this.notifications.push(notification);
            return notification;
        } catch (error) {
            console.error('Erro ao enviar notificação:', error);
            return null;
        }
    }

    sendAppointmentReminder(paciente, horario, minutosAntes = 30) {
        return this.sendNotification('Lembrete de Consulta', {
            body: `Consulta com ${paciente} em ${minutosAntes} minutos (${horario})`,
            tag: 'appointment-reminder',
            data: {
                type: 'appointment',
                paciente: paciente,
                horario: horario
            }
        });
    }

    sendNewAppointmentNotification(paciente, data, horario) {
        return this.sendNotification('Nova Consulta Agendada', {
            body: `Consulta com ${paciente} agendada para ${data} às ${horario}`,
            tag: 'new-appointment'
        });
    }

    sendSessionRecordedNotification(paciente) {
        return this.sendNotification('Registro de Sessão', {
            body: `Registro da sessão com ${paciente} foi salvo com sucesso`,
            tag: 'session-recorded'
        });
    }

    sendPendingSessionReminder(paciente, dataSessao) {
        return this.sendNotification('Registro Pendente', {
            body: `Você ainda não registrou a sessão com ${paciente} do dia ${dataSessao}`,
            tag: 'pending-session'
        });
    }

    sendBirthdayNotification(paciente) {
        return this.sendNotification('Aniversário Hoje!', {
            body: `Hoje é aniversário de ${paciente}! Envie seus parabéns.`,
            tag: 'birthday',
            requireInteraction: false
        });
    }

    scheduleNotification(time, title, options) {
        const now = new Date();
        const notificationTime = new Date(time);
        const delay = notificationTime.getTime() - now.getTime();

        if (delay > 0) {
            setTimeout(() => {
                this.sendNotification(title, options);
            }, delay);
        }
    }

    async checkUpcomingAppointments() {
        try {
            const response = await fetch('/api/lembretes/hoje');
            const consultas = await response.json();

            const agora = new Date();
            consultas.forEach(consulta => {
                const [hora, minuto] = consulta.horario.split(':');
                const consultaTime = new Date();
                consultaTime.setHours(parseInt(hora), parseInt(minuto), 0);
                
                const diffMs = consultaTime - agora;
                const diffMin = Math.round(diffMs / 60000);

                if (diffMin === 30) {
                    this.sendAppointmentReminder(consulta.paciente_nome, consulta.horario, 30);
                } else if (diffMin === 15) {
                    this.sendAppointmentReminder(consulta.paciente_nome, consulta.horario, 15);
                } else if (diffMin === 5) {
                    this.sendAppointmentReminder(consulta.paciente_nome, consulta.horario, 5);
                }
            });
        } catch (error) {
            console.error('Erro ao verificar consultas:', error);
        }
    }

    async checkPendingSessions() {
        try {
            const response = await fetch('/api/consultas?status=realizado');
            const consultas = await response.json();
            
            const hoje = new Date();
            consultas.forEach(async consulta => {
                const [dia, mes, ano] = consulta.data_consulta.split('-');
                const dataConsulta = new Date(ano, mes - 1, dia);
                const diffDias = Math.floor((hoje - dataConsulta) / (1000 * 60 * 60 * 24));

                if (diffDias >= 1) {
                    const [registros] = await promisePool.query(
                        'SELECT id FROM registros_sessao WHERE consulta_id = ?',
                        [consulta.id]
                    );

                    if (registros.length === 0) {
                        this.sendPendingSessionReminder(
                            consulta.paciente_nome, 
                            consulta.data_consulta
                        );
                    }
                }
            });
        } catch (error) {
            console.error('Erro ao verificar registros pendentes:', error);
        }
    }

    startReminderMonitoring(intervalMinutes = 1) {
        setInterval(() => {
            this.checkUpcomingAppointments();
        }, intervalMinutes * 60 * 1000);

        setInterval(() => {
            this.checkPendingSessions();
        }, 60 * 60 * 1000);

        console.log('Monitoramento de lembretes iniciado');
    }

    clearNotifications() {
        this.notifications.forEach(notification => notification.close());
        this.notifications = [];
    }
}

window.NotificationManager = NotificationManager;