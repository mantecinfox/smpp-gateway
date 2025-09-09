import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
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
  Alert
} from '@mui/material';
import { Add, Phone } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const Dids = () => {
  const [dids, setDids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { isAdmin } = useAuth();

  useEffect(() => {
    fetchDids();
  }, []);

  const fetchDids = async () => {
    try {
      setLoading(true);
      const endpoint = isAdmin ? '/admin/dids' : '/client/dids';
      const response = await api.get(endpoint);
      setDids(response.data.dids);
    } catch (err) {
      setError('Erro ao carregar DIDs');
      console.error('Erro ao carregar DIDs:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'available':
        return 'success';
      case 'assigned':
        return 'primary';
      case 'inactive':
        return 'error';
      default:
        return 'default';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'available':
        return 'Disponível';
      case 'assigned':
        return 'Atribuído';
      case 'inactive':
        return 'Inativo';
      default:
        return status;
    }
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
          DIDs
        </Typography>
        {isAdmin && (
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => {/* Implementar criação de DIDs */}}
          >
            Criar DIDs
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
                <Phone color="primary" sx={{ mr: 2 }} />
                <Box>
                  <Typography variant="h6">
                    {dids.length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total de DIDs
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
                <Phone color="success" sx={{ mr: 2 }} />
                <Box>
                  <Typography variant="h6">
                    {dids.filter(d => d.status === 'assigned').length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Atribuídos
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
                <Phone color="info" sx={{ mr: 2 }} />
                <Box>
                  <Typography variant="h6">
                    {dids.filter(d => d.status === 'available').length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Disponíveis
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
                  <TableCell>Número</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Plataformas</TableCell>
                  <TableCell>Usuário</TableCell>
                  <TableCell>Data de Criação</TableCell>
                  {isAdmin && <TableCell>Ações</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {dids.map((did) => (
                  <TableRow key={did.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace">
                        {did.number}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={getStatusLabel(did.status)} 
                        size="small" 
                        color={getStatusColor(did.status)}
                      />
                    </TableCell>
                    <TableCell>
                      <Box display="flex" gap={0.5} flexWrap="wrap">
                        {did.platforms?.map((platform, index) => (
                          <Chip 
                            key={index}
                            label={platform.toUpperCase()} 
                            size="small" 
                            variant="outlined"
                          />
                        ))}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {did.user_id ? `Usuário ${did.user_id}` : 'Não atribuído'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {new Date(did.created_at).toLocaleDateString()}
                      </Typography>
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

export default Dids;