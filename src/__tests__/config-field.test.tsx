import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ConfigField } from '../components/ConfigField'
import { getAction } from '../actions/init'
import { useGatewayStore } from '../store/gateway-store'
import type { ConfigField as ConfigFieldDef } from '../types/actions'

const channelField: ConfigFieldDef = {
  id: 'channel',
  label: 'Channel',
  type: 'select',
  gatewaySource: 'channels',
  options: [
    { label: '(connect Gateway to discover channels)', value: '' },
    { label: 'Discord', value: 'discord' },
    { label: 'Slack', value: 'slack' },
  ],
}

beforeEach(() => {
  useGatewayStore.setState({
    config: null,
    gateways: [],
    selectedGatewayId: null,
    status: 'disconnected',
    discovery: null,
    lastError: null,
    lastRefresh: null,
  })
})

describe('ConfigField gateway options', () => {
  it('falls back to static select options when live discovery has no options', () => {
    useGatewayStore.setState({
      status: 'connected',
      discovery: {
        agents: [],
        models: [],
        channels: [],
        channelDiscoveryStatus: 'unavailable',
        skills: [],
        tools: [],
        effectiveTools: null,
      },
    })

    render(<ConfigField field={channelField} value="" onChange={() => undefined} />)

    const select = screen.getByTestId('config-field-channel')
    expect(within(select).getByRole('option', { name: 'Discord' })).toBeInTheDocument()
    expect(within(select).getByRole('option', { name: 'Slack' })).toBeInTheDocument()
  })

  it('uses discovered gateway options when channels are available', () => {
    useGatewayStore.setState({
      status: 'connected',
      discovery: {
        agents: [],
        models: [],
        channels: [{ id: 'telegram', enabled: true, type: 'telegram' }],
        channelDiscoveryStatus: 'available',
        skills: [],
        tools: [],
        effectiveTools: null,
      },
    })

    render(<ConfigField field={channelField} value="telegram" onChange={() => undefined} />)

    const select = screen.getByTestId('config-field-channel')
    expect(within(select).getByRole('option', { name: 'telegram' })).toBeInTheDocument()
    expect(within(select).queryByRole('option', { name: 'Discord' })).toBeNull()
  })

  it('uses discovered agents for the Run Agent block agent selector', () => {
    useGatewayStore.setState({
      status: 'connected',
      discovery: {
        agents: [{ id: 'researcher', name: 'Researcher' }],
        models: [],
        channels: [],
        channelDiscoveryStatus: 'available',
        skills: [],
        tools: [],
        effectiveTools: null,
      },
    })
    const action = getAction('run-agent')
    const agentField = action?.configFields.find((field) => field.id === 'agentId')
    expect(agentField).toBeDefined()

    render(<ConfigField field={agentField!} value="researcher" onChange={() => undefined} />)

    const select = screen.getByTestId('config-field-agentId')
    expect(within(select).getByRole('option', { name: 'Researcher' })).toBeInTheDocument()
    expect(within(select).queryByRole('option', { name: 'Gateway default' })).toBeNull()
  })

  it('offers discovered channel targets for text fields while preserving manual entry', () => {
    useGatewayStore.setState({
      status: 'connected',
      discovery: {
        agents: [],
        models: [],
        channels: [{ id: 'discord', enabled: true, type: 'discord' }],
        channelTargets: [{ id: 'channel:general', label: 'General discord', provider: 'discord' }],
        channelDiscoveryStatus: 'available',
        skills: [],
        tools: [],
        effectiveTools: null,
      },
    })
    const action = getAction('send-channel-message')
    const targetField = action?.configFields.find((field) => field.id === 'target')
    expect(targetField).toBeDefined()

    render(<ConfigField field={targetField!} value="" onChange={() => undefined} />)

    const input = screen.getByTestId('config-field-target')
    expect(input).toHaveAttribute('list', 'gateway-options-target')
    const datalist = document.getElementById('gateway-options-target')
    const option = datalist?.querySelector('option[value="channel:general"]')
    expect(option?.textContent).toBe('General discord')
  })

  it('explains manual target fallback when channel discovery exposes no targets', () => {
    useGatewayStore.setState({
      status: 'connected',
      discovery: {
        agents: [],
        models: [],
        channels: [{ id: 'discord', enabled: true, type: 'discord' }],
        channelTargets: [],
        channelDiscoveryStatus: 'available',
        skills: [],
        tools: [],
        effectiveTools: null,
      },
    })
    const action = getAction('send-channel-message')
    const targetField = action?.configFields.find((field) => field.id === 'target')
    expect(targetField).toBeDefined()

    render(<ConfigField field={targetField!} value="" onChange={() => undefined} />)

    const input = screen.getByTestId('config-field-target')
    expect(input).not.toHaveAttribute('list')
    expect(screen.getByTestId('config-field-target-fallback')).toHaveTextContent(
      'This gateway did not expose channel targets. Enter a target manually, such as channel:<id>.',
    )
  })

  it('explains manual target fallback when channel discovery is unavailable', () => {
    useGatewayStore.setState({
      status: 'connected',
      discovery: {
        agents: [],
        models: [],
        channels: [],
        channelDiscoveryStatus: 'unavailable',
        skills: [],
        tools: [],
        effectiveTools: null,
      },
    })
    const action = getAction('send-channel-message')
    const targetField = action?.configFields.find((field) => field.id === 'target')
    expect(targetField).toBeDefined()

    render(<ConfigField field={targetField!} value="" onChange={() => undefined} />)

    expect(screen.getByTestId('config-field-target-fallback')).toHaveTextContent(
      'Gateway channel target discovery is unavailable. Enter a target manually, such as channel:<id>.',
    )
  })

  it('offers discovered paired nodes for the Node Action node field while preserving manual entry', () => {
    useGatewayStore.setState({
      status: 'connected',
      discovery: {
        agents: [],
        models: [],
        channels: [],
        channelDiscoveryStatus: 'available',
        skills: [],
        tools: [],
        nodes: [{ id: 'oc-node-1', name: 'MacBook', connected: true }],
        effectiveTools: null,
      },
    })
    const action = getAction('node-action')
    const nodeField = action?.configFields.find((field) => field.id === 'node')
    expect(nodeField).toBeDefined()

    render(<ConfigField field={nodeField!} value="" onChange={() => undefined} />)

    const input = screen.getByTestId('config-field-node')
    expect(input).toHaveAttribute('list', 'gateway-options-node')
    const datalist = document.getElementById('gateway-options-node')
    const option = datalist?.querySelector('option[value="oc-node-1"]')
    expect(option?.textContent).toBe('MacBook')
  })
})
