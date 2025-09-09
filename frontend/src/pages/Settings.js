import React, { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Grid,
  Divider,
  Alert,
  Switch,
  FormControlLabel
} from '@mui/material';
import { Save, Security, Notifications } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const Settings = () => {
  const { user, changePassword, generateApiKey } = useAuth();
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [apiKey, setApiKey] = useState(user?.api_key || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePasswordChange = (e) => {
    setPasswordData({
      ...passwordData,
      [e.target.name]: e.target.value
    });
    setError('');
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('As senhas não coincidem');
      setLoading(false);
      return;
    }

    try {
      const result = await changePassword(passwordData.currentPassword, passwordData.newPassword);
      if (result.success) {
        toast.success('Senha alterada com sucesso!');
        setPasswordData({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
      } else {
        setError(result.error);
        toast.error(result.error);
      }
    } catch (err) {
      const errorMessage = 'Erro ao alterar senha';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateApiKey = async () => {
    setLoading(true);
    try {
      const result = await generateApiKey();
      if (result.success) {
        setApiKey(result.apiKey);
        toast.success('Nova API key gerada!');
      } else {
        toast.error(result.error);
      }
    } catch (err) {
      toast.error('Erro ao gerar API key');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Configurações
      </Typography>

      <Grid container spacing={3}>
        {/* Alterar Senha */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <Security color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">
                  Segurança
                </Typography>
              </Box>
              
              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}

              <Box component="form" onSubmit={handlePasswordSubmit}>
                <TextField
                  fullWidth
                  label="Senha Atual"
                  name="currentPassword"
                  type="password"
                  value={passwordData.currentPassword}
                  onChange={handlePasswordChange}
                  disabled={loading}
                  margin="normal"
                />
                
                <TextField
                  fullWidth
                  label="Nova Senha"
                  name="newPassword"
                  type="password"
                  value={passwordData.newPassword}
                  onChange={handlePasswordChange}
                  disabled={loading}
                  margin="normal"
                />
                
                <TextField
                  fullWidth
                  label="Confirmar Nova Senha"
                  name="confirmPassword"
                  type="password"
                  value={passwordData.confirmPassword}
                  onChange={handlePasswordChange}
                  disabled={loading}
                  margin="normal"
                />
                
                <Button
                  type="submit"
                  variant="contained"
                  startIcon={<Save />}
                  disabled={loading}
                  sx={{ mt: 2 }}
                >
                  {loading ? 'Alterando...' : 'Alterar Senha'}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* API Key */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <Security color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">
                  API Key
                </Typography>
              </Box>
              
              <TextField
                fullWidth
                label="Sua API Key"
                value={apiKey}
                disabled
                margin="normal"
                helperText="Use esta chave para autenticar nas APIs"
              />
              
              <Button
                variant="outlined"
                onClick={handleGenerateApiKey}
                disabled={loading}
                sx={{ mt: 2 }}
              >
                {loading ? 'Gerando...' : 'Gerar Nova API Key'}
              </Button>
            </CardContent>
          </Card>
        </Grid>

        {/* Notificações */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <Notifications color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">
                  Notificações
                </Typography>
              </Box>
              
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={<Switch defaultChecked />}
                    label="Notificações por Email"
                  />
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={<Switch defaultChecked />}
                    label="Notificações de Webhook"
                  />
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={<Switch />}
                    label="Alertas de Sistema"
                  />
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={<Switch defaultChecked />}
                    label="Relatórios Diários"
                  />
                </Grid>
              </Grid>
              
              <Button
                variant="contained"
                startIcon={<Save />}
                disabled={loading}
                sx={{ mt: 2 }}
              >
                Salvar Configurações
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Settings;