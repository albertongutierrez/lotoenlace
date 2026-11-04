import Modal from '../../resources/js/Components/Modal';
// @vitest-environment jsdom
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import React, { useState } from 'react';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ComboboxSelect from '../../resources/js/Components/ComboboxSelect';
beforeAll(()=>{
 globalThis.ResizeObserver=class { observe(){} unobserve(){} disconnect(){} };
 HTMLElement.prototype.scrollIntoView=vi.fn();
});
afterEach(cleanup);
function Example(){
 const [value,setValue]=useState('');
 return <form onSubmit={e=>{e.preventDefault();throw new Error('No debe enviar al seleccionar');}}><label>Sorteo<ComboboxSelect value={value} name="draw" onChange={e=>setValue(e.target.value)}><option value="">Todos</option><option value="21">Quiniela LoteDom</option><option value="22">Quemaito Mayor</option><option value="23" disabled>Cerrado</option></ComboboxSelect></label><output data-testid="value">{value}</output><button>Consultar</button></form>;
}
test('busca por nombre y selecciona el ID con teclado sin enviar el formulario',async()=>{
 const user=userEvent.setup();render(<Example/>);
 const input=screen.getByRole('combobox',{name:'Sorteo'});
 await user.clear(input);await user.type(input,'Quemaito');
 expect(await screen.findByRole('option',{name:'Quemaito Mayor'})).toBeTruthy();
 expect(screen.queryByRole('option',{name:'Quiniela LoteDom'})).toBeNull();
 await user.keyboard('{ArrowDown}{Enter}');
 await waitFor(()=>expect(screen.getByTestId('value').textContent).toBe('22'));
 expect((input as HTMLInputElement).value).toBe('Quemaito Mayor');
 expect(document.querySelector('input[name="draw"]')?.getAttribute('value')).toBe('22');
});
test('permite volver a Todos y respeta opciones deshabilitadas',async()=>{
 const user=userEvent.setup();render(<Example/>);
 await user.click(screen.getByRole('button',{name:'Mostrar opciones'}));
 expect((await screen.findByRole('option',{name:'Cerrado'})).getAttribute('aria-disabled')).toBe('true');
 await user.click(screen.getByRole('option',{name:'Quiniela LoteDom'}));
 expect(screen.getByTestId('value').textContent).toBe('21');
 await user.click(screen.getByRole('button',{name:'Mostrar opciones'}));
 await user.click(await screen.findByRole('option',{name:'Todos'}));
 expect(screen.getByTestId('value').textContent).toBe('');
});
test('Escape cierra la lista y conserva el valor',async()=>{
 const user=userEvent.setup();render(<Example/>);
 const input=screen.getByRole('combobox');await user.type(input,'no existe');
 expect(await screen.findByText('Sin resultados.')).toBeTruthy();
 await user.keyboard('{Escape}');
 await waitFor(()=>expect(input.getAttribute('aria-expanded')).toBe('false'));
 expect(screen.getByTestId('value').textContent).toBe('');
});
test('deshabilitado no permite abrir ni modificar',async()=>{
 const user=userEvent.setup();render(<ComboboxSelect disabled value="DOP"><option value="DOP">Peso dominicano</option></ComboboxSelect>);
 expect((screen.getByRole('combobox') as HTMLInputElement).disabled).toBe(true);
 await user.click(screen.getByRole('button',{name:'Mostrar opciones'}));
 expect(screen.queryByRole('listbox')).toBeNull();
});

test('la lista permanece dentro de la modal y Escape no cierra la modal al buscar',async()=>{
 const user=userEvent.setup();const close=vi.fn();
 render(<Dialog open onClose={close}><DialogPanel><DialogTitle>Configurar sorteo</DialogTitle><Example/></DialogPanel></Dialog>);
 const input=await screen.findByRole('combobox');
 await user.clear(input);await user.type(input,'Quemaito');
 const option=await screen.findByRole('option',{name:'Quemaito Mayor'});
 expect(option.closest('[role="dialog"]')).toBeTruthy();
 await user.keyboard('{Escape}');
 expect(close).not.toHaveBeenCalled();
 expect(screen.getByRole('dialog')).toBeTruthy();
});

test('actualiza las opciones dependientes sin conservar nombres de otro sorteo',async()=>{
 const {rerender}=render(<ComboboxSelect aria-label="Sorteo" value="1"><option value="1">Sorteo A</option></ComboboxSelect>);
 expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('Sorteo A');
 rerender(<ComboboxSelect aria-label="Sorteo" value="2"><option value="2">Sorteo B</option></ComboboxSelect>);
 await waitFor(()=>expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('Sorteo B'));
});

for(const entry of ['click','tab']) test(`escribe directamente al entrar con ${entry} sin borrar la selección anterior`,async()=>{
 const user=userEvent.setup();render(<Example/>);
 const input=screen.getByRole('combobox');
 if(entry==='click') await user.click(input); else await user.tab();
 await user.keyboard('Quemaito');
 expect((input as HTMLInputElement).value).toBe('Quemaito');
 expect(await screen.findByRole('option',{name:'Quemaito Mayor'})).toBeTruthy();
 await user.keyboard('{ArrowDown}{Enter}');
 await waitFor(()=>expect(screen.getByTestId('value').textContent).toBe('22'));
 await user.click(input);await user.keyboard('Quiniela');
 expect((input as HTMLInputElement).value).toBe('Quiniela');
 await user.keyboard('{Escape}');
 expect(screen.getByTestId('value').textContent).toBe('22');
 expect((input as HTMLInputElement).value).toBe('Quemaito Mayor');
});

for(const entry of ['mouse','keyboard']) test(`seleccionar Quiniela con ${entry} mantiene Ligar números abierta y permite Agregar`,async()=>{
 const user=userEvent.setup();const submit=vi.fn();const close=vi.fn();
 function CombineDialog(){
  const [open,setOpen]=useState(true);const [mode,setMode]=useState('pale');
  return <Modal show={open} onClose={()=>{close();setOpen(false);}}><form onSubmit={e=>{e.preventDefault();submit(mode);}}><DialogTitle>Ligar números</DialogTitle><label>Quiero generar<ComboboxSelect value={mode} onChange={e=>setMode(e.target.value)}><option value="quiniela">Quiniela</option><option value="pale">Palé</option><option value="tripleta">Tripleta</option></ComboboxSelect></label><input aria-label="Monto" defaultValue="10"/><button type="submit">Agregar</button></form></Modal>;
 }
 render(<CombineDialog/>);
 const input=await screen.findByRole('combobox');
 await user.click(input);await user.keyboard('Quiniela');
 const option=await screen.findByRole('option',{name:'Quiniela'});
 expect(option.closest('[data-modal-panel]')).toBeTruthy();
 if(entry==='mouse')await user.click(option);else await user.keyboard('{ArrowDown}{Enter}');
 expect(close).not.toHaveBeenCalled();
 expect(screen.getByRole('dialog')).toBeTruthy();
 expect(submit).not.toHaveBeenCalled();
 await user.click(screen.getByRole('button',{name:'Agregar'}));
 expect(submit).toHaveBeenCalledWith('quiniela');
});
