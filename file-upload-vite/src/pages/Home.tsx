import React from 'react'
import { Card, Row, Col, Statistic } from 'antd'
import { useAppSelector } from '../hooks/redux'

const Home: React.FC = () => {
  const { user } = useAppSelector(state => state.user)
  const { theme } = useAppSelector(state => state.app)

  return (
    <div>
      <h1>欢迎回来, {user?.name}!</h1>
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic title="当前主题" value={theme} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="用户ID" value={user?.id || 0} />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default Home