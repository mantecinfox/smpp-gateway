import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  TextField,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Pagination,
  CircularProgress,
  Alert
} from '@mui/material';
import { Search, FilterList, Refresh } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const Messages = () => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    search: '',
    platform: '',
    status: '',
    page: 1,
    limit: 50
  });
  const [pagination, setPagination] = useState({
    total: 0,
    pages: 0
  });
  const { isAdmin } = useAuth();

  useEffect(() => {
    fetchMessages();
  }, [filters]);

  const fetchMessages = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      Object.keys(filters).forEach(key => {
        if (filters[key]) {
          params.append(key, filters[key]);
        }
      });

      const endpoint = isAdmin ? '/admin/messages' : '/client/messages';
      const response = await api.get(`${endpoint}?${params}`);
      
      setMessages(response.data.messages);
      setPagination(response.data.pagination);
    } catch (err) {
      setError('Erro ao carregar mensagens');
      console.error('Erro ao carregar mensagens:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({
      ...prev,
      [field]: value,
      page: 1
    }));
  };

  const handlePageChange = (event, page) => {
    setFilters(prev => ({
      ...prev,
      page
    }));
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'received':
        return 'primary';
      case 'processed':
        return 'success';
      case 'failed':
        return 'error';
      default:
        return 'default';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'received':
        return 'Recebida';
      case 'processed':
        return 'Processada';
      case 'failed':
        return 'Falha';
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
      <Typography variant="h4" gutterBottom>
        Mensagens
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="Buscar"
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                InputProps={{
                  startAdornment: <Search sx={{ mr: 1, color: 'text.secondary' }} />
                }}
              />
            </Grid>
            
            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>Plataforma</InputLabel>
                <Select
                  value={filters.platform}
                  onChange={(e) => handleFilterChange('platform', e.target.value)}
                  label="Plataforma"
                >
                  <MenuItem value="">Todas</MenuItem>
                  <MenuItem value="wa">WhatsApp</MenuItem>
                  <MenuItem value="tg">Telegram</MenuItem>
                  <MenuItem value="ig">Instagram</MenuItem>
                  <MenuItem value="fb">Facebook</MenuItem>
                  <MenuItem value="tw">Twitter</MenuItem>
                  <MenuItem value="go">Google</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={filters.status}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  label="Status"
                >
                  <MenuItem value="">Todos</MenuItem>
                  <MenuItem value="received">Recebida</MenuItem>
                  <MenuItem value="processed">Processada</MenuItem>
                  <MenuItem value="failed">Falha</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={2}>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<Refresh />}
                onClick={fetchMessages}
              >
                Atualizar
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>DID</TableCell>
                  <TableCell>Remetente</TableCell>
                  <TableCell>Mensagem</TableCell>
                  <TableCell>Plataforma</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Data</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {messages.map((message) => (
                  <TableRow key={message.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace">
                        {message.did}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {message.sender}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          maxWidth: 300,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {message.message}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={message.platform.toUpperCase()} 
                        size="small" 
                        color="primary" 
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={getStatusLabel(message.status)} 
                        size="small" 
                        color={getStatusColor(message.status)}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {new Date(message.created_at).toLocaleString()}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {pagination.pages > 1 && (
            <Box display="flex" justifyContent="center" mt={3}>
              <Pagination
                count={pagination.pages}
                page={filters.page}
                onChange={handlePageChange}
                color="primary"
              />
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default Messages;