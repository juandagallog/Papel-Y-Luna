from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("tienda", "0001_initial")]
    operations = [
        migrations.AddField(model_name="cliente", name="tipo", field=models.CharField(choices=[("persona", "Persona"), ("empresa", "Empresa")], default="persona", max_length=10)),
        migrations.AddField(model_name="proveedor", name="tipo", field=models.CharField(choices=[("persona", "Persona"), ("empresa", "Empresa")], default="empresa", max_length=10)),
        migrations.AddField(model_name="proveedor", name="documento", field=models.CharField(blank=True, default="", max_length=50)),
        migrations.AddField(model_name="proveedor", name="direccion", field=models.CharField(blank=True, default="", max_length=200)),
        migrations.AddField(model_name="faltante", name="notas", field=models.TextField(blank=True, default="", max_length=1000)),
    ]
