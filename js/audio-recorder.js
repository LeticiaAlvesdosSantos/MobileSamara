class AudioRecorder {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.recordings = [];
        this.stream = null;
        this.isRecording = false;
    }

    async init() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(this.stream);
            
            this.mediaRecorder.ondataavailable = (event) => {
                this.audioChunks.push(event.data);
            };

            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
                const audioUrl = URL.createObjectURL(audioBlob);
                const audioName = `audio_${Date.now()}.wav`;
                
                this.recordings.push({
                    name: audioName,
                    url: audioUrl,
                    blob: audioBlob,
                    date: new Date()
                });

                this.audioChunks = [];
                this.isRecording = false;
                
                this.onRecordingComplete?.(audioName, audioUrl, audioBlob);
            };

            return true;
        } catch (error) {
            console.error('Erro ao acessar microfone:', error);
            throw new Error('Não foi possível acessar o microfone');
        }
    }

    startRecording() {
        if (!this.mediaRecorder) {
            throw new Error('Gravador não inicializado');
        }

        this.audioChunks = [];
        this.mediaRecorder.start();
        this.isRecording = true;
        this.onRecordingStart?.();
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.stream.getTracks().forEach(track => track.stop());
            this.onRecordingStop?.();
        }
    }

    pauseRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.pause();
            this.onRecordingPause?.();
        }
    }

    resumeRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.resume();
            this.onRecordingResume?.();
        }
    }

    playRecording(url) {
        const audio = new Audio(url);
        audio.play();
        return audio;
    }

    async saveRecording(blob, pacienteId, registroId) {
        const formData = new FormData();
        formData.append('audio', blob, `audio_${Date.now()}.wav`);
        formData.append('paciente_id', pacienteId);
        formData.append('registro_id', registroId);

        try {
            const response = await fetch('/api/audios/upload', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            
            if (data.success) {
                this.onAudioSaved?.(data);
                return data;
            } else {
                throw new Error('Erro ao salvar áudio');
            }
        } catch (error) {
            console.error('Erro ao salvar áudio:', error);
            throw error;
        }
    }

    deleteRecording(index) {
        if (index >= 0 && index < this.recordings.length) {
            URL.revokeObjectURL(this.recordings[index].url);
            this.recordings.splice(index, 1);
            this.onRecordingDeleted?.(index);
        }
    }

    clearRecordings() {
        this.recordings.forEach(rec => URL.revokeObjectURL(rec.url));
        this.recordings = [];
        this.onRecordingsCleared?.();
    }

    static async checkPermissions() {
        try {
            const permission = await navigator.permissions.query({ name: 'microphone' });
            return permission.state;
        } catch (error) {
            console.error('Erro ao verificar permissões:', error);
            return 'prompt';
        }
    }

    static formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}

window.AudioRecorder = AudioRecorder;