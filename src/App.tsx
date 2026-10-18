import { EditorShell } from './components/EditorShell'
import { ConfirmProvider } from './hooks/ConfirmProvider'

export default function App() {
  return (
    <ConfirmProvider>
      <EditorShell />
    </ConfirmProvider>
  )
}
