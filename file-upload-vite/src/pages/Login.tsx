import React from 'react'
import { Form, Input, Button, Card, message } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { useAuth } from '../hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import { User } from '../types'

interface LoginForm {
  username: string
  password: string
}

export default const Login: React.FC = () => {
  const { login } = useAuth

}