import type { ClientModule } from 'claude-code'

// A bare gear at title size, which a Button's label never gets; a click opens or closes the settings row.
const Gear: ClientModule = (_props, surface) => {
  surface.onPointer(event => {
    if (event.type === 'down') surface.post('toggle')
  })
  const { Text } = surface.elements

  return <Text size="title">⚙</Text>
}

export default Gear
