import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useAuthStore } from './store/authStore';
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';
import ClassesPage from './pages/ClassesPage';
import LessonsPage from './pages/LessonsPage';
import StudentsPage from './pages/StudentsPage';
import StudentDetailPage from './pages/StudentDetailPage';

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoggedIn } = useAuthStore();
  return isLoggedIn ? <>{children}</> : <Navigate to="/login" replace />;
};

const App: React.FC = () => {
  const { init } = useAuthStore();
  useEffect(() => { init(); }, [init]);

  return (
    <ConfigProvider locale={zhCN} theme={{
      token: {
        colorPrimary: '#ff385c',      // Rausch Red
        colorTextBase: '#222222',     // Near Black
        colorBgLayout: '#ffffff',     // Pure White canvas
        colorBgContainer: '#ffffff',  // Surface white
        borderRadius: 8,              // Buttons and standard elements
        fontFamily: "'Airbnb Cereal VF', 'Inter', 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif",
      },
      components: {
        Card: {
          borderRadiusLG: 20,
          boxShadowSecondary: 'rgba(0,0,0,0.02) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 6px, rgba(0,0,0,0.1) 0px 4px 8px',
        },
        Button: {
          fontWeight: 500,
        },
        Menu: {
          itemColor: '#6a6a6a',
          itemSelectedColor: '#ff385c',
          itemSelectedBg: 'rgba(255,56,92,0.05)',
        },
        Table: {
          borderRadiusLG: 8,
        }
      }
    }}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<Navigate to="/classes" replace />} />
            <Route path="classes" element={<ClassesPage />} />
            <Route path="lessons" element={<LessonsPage />} />
            <Route path="students" element={<StudentsPage />} />
            <Route path="students/:id" element={<StudentDetailPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
};

export default App;
