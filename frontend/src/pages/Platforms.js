import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Alert,
  Button
} from '@mui/material';
import { Apps, Add } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const Platforms = () => {
  const [platforms, setPlatforms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { isAdmin } = useAuth();

  useEffect(() => {
    fetchPlatforms();
  }, []);

  const fetchPlatforms = async () => {
    try {
      setLoading(true);
      const response = await api.get('/platforms');
      setPlatforms(response.data.platforms);
    } catch (err) {
      setError('Erro ao carregar plataformas');
      console.error('Erro ao carregar plataformas:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    return status === 'active' ? 'success' : 'error';
  };

  const getStatusLabel = (status) => {
    return status === 'active' ? 'Ativa' : 'Inativa';
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">
          Plataformas
        </Typography>
        {isAdmin && (
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => {/* Implementar criação de plataformas */}}
          >
            Adicionar Plataforma
          </Button>
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <Apps color="primary" sx={{ mr: 2 }} />
                <Box>
                  <Typography variant="h6">
                    {platforms.length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total de Plataformas
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <Apps color="success" sx={{ mr: 2 }} />
                <Box>
                  <Typography variant="h6">
                    {platforms.filter(p => p.status === 'active').length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Ativas
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Nome</TableCell>
                  <TableCell>Código</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Preço</TableCell>
                  <TableCell>Webhook</TableCell>
                  <TableCell>Auto Forward</TableCell>
                  {isAdmin && <TableCell>Ações</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {platforms.map((platform) => (
                  <TableRow key={platform.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {platform.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {platform.description}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={platform.code.toUpperCase()} 
                        size="small" 
                        color="primary" 
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={getStatusLabel(platform.status)} 
                        size="small" 
                        color={getStatusColor(platform.status)}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        R$ {platform.price.toFixed(2)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={platform.webhook_url ? 'Sim' : 'Não'} 
                        size="small" 
                        color={platform.webhook_url ? 'success' : 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={platform.auto_forward ? 'Sim' : 'Não'} 
                        size="small" 
                        color={platform.auto_forward ? 'info' : 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <Button size="small" variant="outlined">
                          Editar
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Platforms;