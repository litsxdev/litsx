function MyComponent() {
  // Estilo dinámico: cambia según la propiedad `color`
  useStyle("--dynamic-color", this.color);

  // Efecto que depende de `title` y `color`
  useEffect(() => {
    console.log("Title or color updated:", this.title, this.color);
  }, [this.title, this.color]);

  // Estilos estáticos
  ^styles(`
    :host {
      display: block;
    }

    p {
      color: var(--dynamic-color, black);
    }
  `);

  return (
    <div>
      <p>Hello World</p>
    </div>
  );
}
