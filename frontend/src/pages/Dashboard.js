import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Paper,
  CircularProgress,
  Alert
} from '@mui/material';
import {
  Message,
  Phone,
  Apps,
  People,
  TrendingUp,
  TrendingDown
} from '@mui/icons-material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import api from '../services/api';

const StatCard = ({ title, value, icon, color, trend, trendValue }) => (
  <Card sx={{ height: '100%' }}>
    <CardContent>
      <Box display="flex" alignItems="center" justifyContent="space-between">
        <Box>
          <Typography color="textSecondary" gutterBottom variant="h6">
            {title}
          </Typography>
          <Typography variant="h4" component="h2">
            {value}
          </Typography>
          {trend && (
            <Box display="flex" alignItems="center" mt={1}>
              {trend === 'up' ? (
                <TrendingUp color="success" fontSize="small" />
              ) : (
                <TrendingDown color="error" fontSize="small" />
              )}
              <Typography
                variant="body2"
                color={trend === 'up' ? 'success.main' : 'error.main'}
                sx={{ ml: 0.5 }}
              >
                {trendValue}%
              </Typography>
            </Box>
          )}
        </Box>
        <Box
          sx={{
            backgroundColor: color,
            borderRadius: '50%',
            p: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {icon}
        </Box>
      </Box>
    </CardContent>
  </Card>
);

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user, isAdmin } = useAuth();
  const { on } = useSocket();

  useEffect(() => {
    fetchStats();
    
    // Escutar atualizações em tempo real
    on('messageReceived', (data) => {
      console.log('Nova mensagem recebida:', data);
      // Atualizar estatísticas em tempo real
      fetchStats();
    });
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const endpoint = isAdmin ? '/admin/dashboard' : '/client/dashboard';
      const response = await api.get(endpoint);
      setStats(response.data);
    } catch (err) {
      setError('Erro ao carregar estatísticas');
      console.error('Erro ao carregar dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  if (!stats) {
    return (
      <Alert severity="info">
        Nenhum dado disponível
      </Alert>
    );
  }

  const { overview, messages, dids, platforms } = stats;

  // Dados para gráficos
  const messagesData = [
    { name: 'Jan', value: 120 },
    { name: 'Fev', value: 150 },
    { name: 'Mar', value: 180 },
    { name: 'Abr', value: 200 },
    { name: 'Mai', value: 250 },
    { name: 'Jun', value: 300 }
  ];

  const platformData = platforms?.stats?.map(p => ({
    name: p.platform,
    value: p.total
  })) || [];

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>
      
      <Grid container spacing={3}>
        {/* Cards de Estatísticas */}
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total de Mensagens"
            value={messages?.total || 0}
            icon={<Message />}
            color="#1976d2"
            trend="up"
            trendValue="12"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="DIDs Ativos"
            value={dids?.assigned || 0}
            icon={<Phone />}
            color="#2e7d32"
            trend="up"
            trendValue="8"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Plataformas"
            value={platforms?.stats?.length || 0}
            icon={<Apps />}
            color="#ed6c02"
          />
        </Grid>
        
        {isAdmin && (
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Usuários"
              value={overview?.totalUsers || 0}
              icon={<People />}
              color="#9c27b0"
              trend="up"
              trendValue="5"
            />
          </Grid>
        )}

        {/* Gráfico de Mensagens */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Mensagens por Mês
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={messagesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#1976d2" 
                    strokeWidth={2}
                    dot={{ fill: '#1976d2', strokeWidth: 2, r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Gráfico de Plataformas */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Mensagens por Plataforma
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={platformData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {platformData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Status das Mensagens */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Status das Mensagens
              </Typography>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={[
                  { name: 'Recebidas', value: messages?.received || 0 },
                  { name: 'Processadas', value: messages?.processed || 0 },
                  { name: 'Falhas', value: messages?.failed || 0 }
                ]}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#1976d2" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Mensagens Recentes */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Mensagens Recentes
              </Typography>
              <Box>
                {messages?.recent?.slice(0, 5).map((message, index) => (
                  <Paper
                    key={index}
                    sx={{
                      p: 2,
                      mb: 1,
                      backgroundColor: '#f5f5f5'
                    }}
                  >
                    <Typography variant="body2" noWrap>
                      <strong>{message.platform}</strong> - {message.message}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(message.created_at).toLocaleString()}
                    </Typography>
                  </Paper>
                )) || (
                  <Typography variant="body2" color="text.secondary">
                    Nenhuma mensagem recente
                  </Typography>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;